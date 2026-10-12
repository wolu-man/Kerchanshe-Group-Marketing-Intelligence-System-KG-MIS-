# KG-MIS — Production Deployment Guide

Brief, practical guide for deploying the KG-MIS Hybrid Market Intelligence System
on a **Windows Server** host with Nginx (Windows) as reverse proxy and PM2 as
process manager.

Target layout:

```
Next.js web portal (:3000)  ←  Nginx (:80/:443)  →  Express API (:4000)  →  MS SQL Server (KG_MIS)
```

> **Repo gotchas**
>
> - The project is **three separate git repos**: this root repo (docs only — its
>   `.gitignore` excludes `backend/` and `frontend/`), plus `backend/` and
>   `frontend/`. Clone/deploy each separately.
> - There is **no root `package.json`** — the root-level `npm run dev` commands in
>   `README.md` are stale. Always run scripts from `backend\` or `frontend\`.
> - `README.md` says "Next.js 15"; the actual pinned version is **Next.js 14.2.5**
>   (`frontend/package.json`).

---

## 1. System Requirements

| Item | Requirement |
| --- | --- |
| Server OS | Windows Server 2019 / 2022 / 2025 (also works on Windows 10/11 for UAT) |
| Node.js | **>= 20** (`backend/package.json` → `"engines": { "node": ">=20" }`); README tested on 26.x |
| npm | 10+ (ships with Node 20+; dev box runs npm 11) |
| Database | **MS SQL Server** (any edition; dev uses SQL Server Express on a dynamic port). Database `KG_MIS` is created automatically by migration `001_initial.sql` |
| SQL tools | `sqlcmd` or SSMS (for login creation, migrations verification, backups) |
| Runtime services | SMTP server (email notifications, port 587), CUAS SSO, D365FO, Power BI tenant — all optional in dev (mocks), required for full production function |
| AI (optional) | Ollama (local, port 11434) **or** Google Gemini / Groq API keys |
| Build tools | None needed beyond Node/npm (TypeScript compiles via `tsc`, no native compilation) |

**Recommended server resources** (guidance, not repo config):

- App server (API + web + Nginx + PM2): **2 vCPU, 4 GB RAM, 40 GB SSD**
- SQL Server host (separate machine/instance): **4 vCPU, 8 GB RAM**, dedicated disk for data + backups
- Ollama host (if used locally): extra **8 GB+ RAM** and a GPU is helpful but not required

---

## 2. Production Environment Setup

### 2.1 Backend — `backend\.env`

Copy the template and edit: `copy backend\.env.example backend\.env`

Production-critical values (enforced by `backend/src/config/env.ts` — the API
**exits with code 1** if violated when `NODE_ENV=production`):

```env
NODE_ENV=production
PORT=4000
APP_BASE_URL=https://mis.example.com          # public web URL (used in email links)
CORS_ORIGIN=https://mis.example.com           # NOT in .env.example — must be added manually
JWT_SECRET=<long random string, minimum 32 chars>
JWT_EXPIRES_IN=8h
SESSION_IDLE_MINUTES=120

# Database — DB_HOST must NOT be localhost in production
DB_HOST=sql01.corp.example.com
DB_PORT=1433
DB_INSTANCE=                                  # set only for named instances (SQL Browser must run)
DB_NAME=KG_MIS
DB_USER=<sql login>
DB_PASSWORD=<strong password>
DB_ENCRYPT=true                               # see note below
DB_TRUST_SERVER_CERTIFICATE=false             # see note below

# Integrations — turn mocks OFF and supply real credentials (one key per line)
CUAS_MOCK=false
CUAS_SSO_URL=...
CUAS_CLIENT_ID=...
CUAS_CLIENT_SECRET=...
CUAS_CALLBACK_URL=https://mis.example.com/api/v1/auth/callback
CUAS_TOKEN_ISSUER=...

D365FO_MOCK=false
D365FO_TENANT_ID=...
D365FO_CLIENT_ID=...
D365FO_CLIENT_SECRET=...
D365FO_RESOURCE=...
D365FO_BASE_URL=...

SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...

POWERBI_MOCK=false
# All of these are required by env.ts validation when POWERBI_MOCK=false:
POWERBI_TENANT_ID=...
POWERBI_CLIENT_ID=...
POWERBI_CLIENT_SECRET=...
POWERBI_GROUP_ID=...
POWERBI_DATASET_ID=...
POWERBI_REPORT_IDS=...

UPLOAD_DIR=uploads
MAX_UPLOAD_MB=50

AI_PROVIDER=auto                             # auto | ollama | gemini | groq
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=                                # empty = first installed non-embedding model
GEMINI_API_KEY=                              # one cloud key is enough
GROQ_API_KEY=
```

Notes:

- `CORS_ORIGIN` is read by the API (`backend/src/config/env.ts`) but is missing
  from `.env.example` — add it manually or the browser portal is blocked by CORS.
- `DB_ENCRYPT`/`DB_TRUST_SERVER_CERTIFICATE`: keep `true`/`false` (trusted cert)
  once the SQL host has a proper certificate; the `false`/`true` pair from the
  template is for lab use only.
- `.env` is gitignored in both packages. Restrict file ACLs:
  `icacls backend\.env /inheritance:r /grant:r "%USERNAME%":F`

### 2.2 Frontend — `frontend\.env`

```env
# Recommended: same origin through Nginx (section 4) — no CORS needed
NEXT_PUBLIC_API_URL=https://mis.example.com/api/v1

# Split-domain alternative (API on its own host):
# NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
```

- `NEXT_PUBLIC_*` values are **inlined at build time** — set this **before**
  running `next build`, otherwise rebuild after changing it.
- In the split-domain setup, set backend `CORS_ORIGIN` to the **web portal**
  origin (`https://mis.example.com`) so browser requests are allowed.
- Several components derive the bare API origin by stripping `/api/v1` (image,
  profile-photo and export URLs) — keep the `/api/v1` suffix in the value.

### 2.3 Database setup and migration

Run from `backend\` (scripts read `backend\.env` automatically):

```powershell
cd C:\path\to\MIS\backend
npm run db:migrate      # applies migrations\*.sql in order; idempotent (ledger: dbo.__Migrations)
npm run db:seed         # ONLY on a fresh/UAT database — see warning
```

- Migration `001_initial.sql` creates the `KG_MIS` database if it does not
  exist. Alternatively create the DB manually and grant the SQL login `db_owner`
  (per `README.md`).
- **Warning:** `npm run db:seed` applies reference data (roles, etc.) **and sets
  the shared dev password `Password123!` on every active user whose password
  differs** (override via `DEV_PASSWORD` env var). On a fresh production DB run
  it **once**, then immediately change all passwords; never run it again on a
  database with live users.
- Optional master-data seeds (dev/UAT): `db:seed:geely`, `db:seed:competitors`,
  `db:seed:history`, `db:seed:tenders`.
- Re-run `npm run db:migrate` after every code update that ships new migration
  files (safe to re-run; already-applied files are skipped).

### 2.4 Build and start commands

```powershell
# API (TypeScript -> dist\)
cd C:\path\to\MIS\backend
npm ci
npm run build                     # tsc -p tsconfig.json
npm start                         # node --use-system-ca dist/index.js

# Web portal
cd C:\path\to\MIS\frontend
npm ci
npm run build                      # next build (NEXT_PUBLIC_API_URL must already be set)
npm start                          # next start -p 3000
```

- **Always start the API with the working directory set to `backend\`** —
  static assets (`public\email` → `/email-assets`) and form uploads
  (`uploads\` → `/uploads`) resolve relative to the process CWD.
- `frontend/next.config.mjs` sets `output: 'standalone'`; `npm start`
  (`next start -p 3000`) is the simplest production runner.
- Verify with `npm run typecheck` (both packages) before deploying.

### 2.5 Required ports

| Port | Service | Exposure |
| --- | --- | --- |
| **80 / 443** | Nginx (public entry) | Public (firewall open) |
| **3000** | Next.js web portal | Localhost only (behind Nginx) |
| **4000** | Express API | Localhost only (behind Nginx) |
| **1433** (or dynamic) | MS SQL Server | Internal network only — never public |
| **11434** | Ollama | Localhost only |
| **587** | SMTP (outbound) | Outbound only |

### 2.6 AI / Ollama setup (optional)

1. Install Ollama for Windows (runs a local service on `http://localhost:11434`).
2. Pull a model: `ollama pull llama3.1` (any chat model).
3. In `backend\.env`: `AI_PROVIDER=auto`, `OLLAMA_BASE_URL=http://localhost:11434`,
   leave `OLLAMA_MODEL` empty to auto-discover the first installed non-embedding
   model.
4. Keep Ollama bound to localhost (default) — the API is the only consumer; keys
   and prompts never reach the browser.
5. No Ollama? Set `GEMINI_API_KEY` and/or `GROQ_API_KEY` instead — `auto` picks
   whichever provider is available. Provider status: `GET /api/v1/ai/providers`
   (requires login; also shown in the portal's AI drawer).

---

## 3. Deployment Steps

### 3.1 Prepare the server

```powershell
# 1. Node.js 20+ (LTS) from https://nodejs.org and Git from https://git-scm.com
node --version   # v20+
npm --version

# 2. SQL Server reachable from the app host (test with sqlcmd)
sqlcmd -S sql01 -U <user> -P <pass> -Q "SELECT @@VERSION"

# 3. Directories (any path; examples below assume C:\MIS)
New-Item -ItemType Directory -Path C:\MIS
```

### 3.2 Deploy the application

```powershell
cd C:\MIS
git clone <backend-repo-url>  backend
git clone <frontend-repo-url> frontend

cd C:\MIS\backend;  npm ci
cd C:\MIS\frontend; npm ci
```

### 3.3 Configure `.env`

```powershell
Copy-Item C:\MIS\backend\.env.example  C:\MIS\backend\.env
Copy-Item C:\MIS\frontend\.env.example C:\MIS\frontend\.env
# Edit both files per section 2 (production values, CORS_ORIGIN, NEXT_PUBLIC_API_URL)
```

### 3.4 Migrate, build, start

```powershell
cd C:\MIS\backend
npm run db:migrate
npm run db:seed            # fresh DB only, then rotate passwords (see 2.3)
npm run typecheck
npm run build

cd C:\MIS\frontend
npm run typecheck
npm run build              # NEXT_PUBLIC_API_URL already set in .env
```

Start both apps with PM2 (section 5), then verify (3.5).

### 3.5 Verify services

```powershell
# API health (must return status: ok, db: connected; 503 = degraded)
Invoke-RestMethod http://localhost:4000/health

# API routing check — unauthenticated API routes return 401 JSON;
# anything other than a connection error proves the API is serving
try { Invoke-WebRequest http://localhost:4000/api/v1/auth/me -UseBasicParsing }
catch { $_.Exception.Response.StatusCode.value__ }      # expect 401

# Web portal
Invoke-WebRequest http://localhost:3000 -UseBasicParsing | Select-Object StatusCode

# Through the proxy (once Nginx is up)
Invoke-RestMethod https://mis.example.com/health
```

Then sign in through the portal and exercise one form create/publish, one file
upload, and one AI request (AI provider status is shown after login —
`GET /api/v1/ai/providers` requires a JWT).

### 3.6 Updating an existing deployment

```powershell
cd C:\MIS\backend;  git pull; npm ci; npm run db:migrate; npm run build; pm2 restart kg-mis-api
cd C:\MIS\frontend; git pull; npm ci; npm run build;                          pm2 restart kg-mis-web
```

---

## 4. Web Server / Reverse Proxy (Nginx for Windows)

Use the official Windows build of Nginx (e.g. `C:\nginx`). Recommended config
(`C:\nginx\conf\nginx.conf`):

```nginx
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;

    upstream mis_web { server 127.0.0.1:3000; }   # Next.js portal
    upstream mis_api { server 127.0.0.1:4000; }   # Express API

    server {
        listen 80;
        server_name mis.example.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name mis.example.com;

        ssl_certificate     C:/nginx/cert/fullchain.pem;
        ssl_certificate_key C:/nginx/cert/privkey.pem;

        # MAX_UPLOAD_MB=50 (API also caps JSON bodies at 10 MB)
        client_max_body_size 50m;

        # Web portal (all Next.js routes and /_next assets)
        location / {
            proxy_pass         http://mis_web;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
        }

        # API, health, uploads and email assets -> Express
        location /api/ {
            proxy_pass         http://mis_api;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
        }

        location /uploads/ {
            proxy_pass         http://mis_api;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
        }

        location /email-assets/ {
            proxy_pass         http://mis_api;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
        }

        location = /health {
            proxy_pass         http://mis_api;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
        }
    }
}
```

Routing summary:

| Path | Backend |
| --- | --- |
| `/` (portal, `/_next/*`) | `127.0.0.1:3000` |
| `/api/` (versioned API, `/api/v1/...`) | `127.0.0.1:4000` |
| `/uploads/` (form file uploads) | `127.0.0.1:4000` |
| `/email-assets/` (email logo) | `127.0.0.1:4000` |
| `/health` (monitoring) | `127.0.0.1:4000` |

**Domain / HTTPS**

- Point the DNS record for `mis.example.com` at the server; obtain certificates
  with **win-acme (wacs)** or the Certbot Windows installer; renewals are
  automatic — reload Nginx after renewal: `nginx.exe -s reload`.
- The API sets `trust proxy`, so client IPs and protocol come from the
  `X-Forwarded-*` headers above.
- `APP_BASE_URL` (emails, SSO links) and `CORS_ORIGIN` must match the public
  HTTPS origin exactly.
- Nginx on Windows is not a service — run it at boot via Task Scheduler
  (`nginx.exe`) or wrap it with WinSW/NSSM.

---

## 5. Process Management (PM2)

```powershell
npm install -g pm2
```

`C:\MIS\ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: 'kg-mis-api',
      script: 'dist/index.js',
      cwd: 'C:/MIS/backend',
      node_args: '--use-system-ca',
      instances: 1,            // REQUIRED: in-process node-cron jobs (D365FO sync,
      autorestart: true,       // tender collection, nightly forecasts) must run once only
      max_restarts: 10,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'kg-mis-web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: 'C:/MIS/frontend',
      instances: 1,
      autorestart: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

```powershell
cd C:\MIS
pm2 start ecosystem.config.js
pm2 save
```

- **Never use cluster mode for the API** — scheduled jobs (node-cron in
  `backend/src/cron/jobs.ts`: D365FO sync, tender collection, reminders,
  nightly predictions, audit purge) run inside the process and would fire once
  per instance.
- Actual `.env` values are loaded by the apps themselves (`backend\.env`,
  `frontend\.env`); PM2 only supplies `NODE_ENV`.

**Auto-start after reboot** — `pm2 startup` is Linux-only. On Windows:

```powershell
npm install -g pm2-windows-service
pm2-service-install          # registers a Windows service that runs "pm2 resurrect" at boot
```

Alternative (no service): Task Scheduler task → Action `pm2 resurrect`,
trigger "At system startup", run whether user is logged on or not.

**Log management**

```powershell
pm2 logs kg-mis-api          # tail API logs
pm2 logs kg-mis-web
pm2 flush                    # clear PM2 logs
```

Logs live in `%USERPROFILE%\.pm2\logs\` (`kg-mis-api-out.log` /
`kg-mis-api-error.log`). The API also writes morgan access logs to stdout (captured
by PM2) in production format. Rotate by clearing periodically (`pm2 flush`) or
with `pm2-logrotate`; archive/ship logs per your ops policy. Keep
`backend\*.log` files out of the repo (they are gitignored).

---

## 6. Production Checklist

### Security
- [ ] `NODE_ENV=production`; `JWT_SECRET` is a random string ≥ 32 chars (app refuses to boot otherwise)
- [ ] Mocks disabled: `CUAS_MOCK=false` (SSO only — local login endpoint is off), `D365FO_MOCK=false`, `POWERBI_MOCK=false` with real credentials
- [ ] Seed/dev passwords rotated — no account uses `Password123!`
- [ ] HTTPS only (port 80 redirects); `APP_BASE_URL` + `CORS_ORIGIN` match the public origin
- [ ] `.env` files excluded from git (they are) and ACL-restricted on disk; no secrets in logs or repo
- [ ] Ollama/Gemini/Groq keys reachable only by the backend (never `NEXT_PUBLIC_*`)
- [ ] Decide whether `/uploads/` should be public — the API serves it without auth today; restrict in Nginx if forms hold sensitive files

### Database backup
- [ ] Nightly full backup of `KG_MIS` via SQL Server Agent job / maintenance plan (plus transaction-log backups if in full recovery model)
- [ ] Weekly **restore test** to a scratch instance
- [ ] Back up `uploads\` (user files) and `backend\.env` (config) with the same schedule

### Firewall / ports
- [ ] Inbound open: **80, 443** only (`netsh advfirewall firewall add rule name="HTTPS" dir=in action=allow protocol=TCP localport=443`)
- [ ] 3000 / 4000 bound to localhost, unreachable from outside
- [ ] SQL Server (1433) reachable only from the app host; 11434 (Ollama) localhost-only
- [ ] Windows Firewall + SQL Server surface configuration reviewed; SQL auth passwords rotated

### Environment variables / secrets
- [ ] Backend `.env` complete per section 2.1 (validation passes — no `[env] Configuration errors` on boot)
- [ ] Frontend `.env` set **before** `next build` (`NEXT_PUBLIC_API_URL` is baked into the bundle)
- [ ] Integration secrets (CUAS, D365FO, Power BI, TenderMetro, SMTP) stored only in `.env`
- [ ] Documented secret-rotation owner and process

### Health checks
- [ ] `GET /health` → `200 {"status":"ok","db":"connected"}` (503 = DB down) — monitored externally (UptimeRobot/Zabbix/etc.) with alerting
- [ ] Web portal returns 200 through the proxy
- [ ] PM2 autorestart verified (kill a process, confirm respawn) and auto-start service confirmed after a server reboot
- [ ] Log review cadence defined (`pm2 logs`, error log thresholds)

### Final verification
- [ ] Fresh clone builds: `npm ci && npm run typecheck && npm run build` in both packages
- [ ] `npm run db:migrate` re-run is a no-op (ledger skips applied files)
- [ ] End-to-end: SSO login → create/publish form → submit response → file upload → dashboard → Power BI report loads
- [ ] AI works (login → AI provider status via `GET /api/v1/ai/providers`, one Ask AI / assistant request)
- [ ] Email notification delivered (SMTP path exercised)
- [ ] Cron jobs fire once and only once (check logs for D365FO sync / tender collection / nightly forecast)
- [ ] Backup taken **and restored** after go-live
