# Kerchanshe SSO — Operations

Running the identity provider day to day: what to check, what the admin
console's sensitive actions actually do, and how to recover. Design is
covered in `SSO-ARCHITECTURE.md`; onboarding a new relying party is
`SSO-INTEGRATION-GUIDE.md`; a full platform deploy has its own dedicated
runbook.

## Contents

1. [Service basics](#1-service-basics)
2. [Running it](#2-running-it)
3. [Configuration](#3-configuration)
4. [Signing keys](#4-signing-keys)
5. [Sessions and the audit chain](#5-sessions-and-the-audit-chain)
6. [Backups](#6-backups)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Service basics

Every relying party's development port is also its production port; only
the environment name, host binding, database name/password, and public
URL differ between the two. All databases can live on one shared
database instance, but no two systems ever share a database.

**The browser entry point is the frontend port, not the backend port.**
The backend serves JSON view models, not rendered pages — opening the
backend port directly gets you JSON, not the login screen.

**Redis (or an equivalent shared cache) is optional.** Without it
configured, rate limiters fall back to a per-process in-memory store,
which is correct for a single instance. Configure a shared cache only
once the identity provider runs more than one process — otherwise the
effective rate limit is silently divided by the instance count, since
each process is enforcing its own separate counter.

**A no-touch legacy app reached through the gateway pattern** should be
addressed through a hostname that isn't a raw loopback IP in development
— a browser treats a raw loop-back address and a hostname that resolves
to it as different origins for cookie purposes, and getting this wrong
produces a session that silently never seeds. That app's own native login
paths (staff or guest) stay directly reachable on its own port,
completely unaffected by the gateway.

---

## 2. Running it

### Development

```bash
cd backend
npm install
cp .env.example .env       # then fill in secrets
npm run db:migrate         # apply migrations to the development database
npm run db:seed:dev        # seeds a starter admin account — see the script for the generated credentials
npm run dev                # starts the backend, and the gateway alongside it

cd ../frontend
npm install
npm run dev                # open this — the frontend, not the backend port
```

Migrations apply automatically on `npm run dev`. Production deliberately
does not do this — see below.

### Production

```bash
cd backend
npm run env:verify:prod    # resolves config, runs every production assertion, starts nothing
npm run build
npm run db:migrate:prod
npm run start:prod

cd ../frontend
npm run build              # the public base path must be set at BUILD time, not at runtime
npm start
```

`env:verify:prod` is the step worth never skipping before trusting a
deployed instance. It loads the real configuration module — so every
production assertion actually runs — and prints the resolved database,
issuer, directory-service settings, and registered clients, without
binding a port or touching the database. It never prints a secret value:
sensitive settings show as set/unset with a length only. Exit code `0`
means it's safe to start.

A process manager (PM2 or similar) and a container runtime are both
optional — nothing about running the identity provider requires either.

---

## 3. Configuration

**Production reads exactly one environment file and nothing else.** The
development environment file is never read in production; a missing
production environment file is a hard refusal to start, not a silent
fallback. Don't reintroduce a "layered" approach where a production file
is loaded on top of a development one — most `.env` loaders only override
the keys the layering file actually names, so any key the production file
doesn't mention silently keeps its development value.

**This matters more for the identity provider than for any relying
party**, because a misconfigured identity provider that boots
successfully — happily, against the wrong database, with a
development-looking issuer baked into every token it signs — hands out
tokens nothing downstream will recognize as wrong until users start
failing to log in elsewhere. Prefer a configuration loader that fails
loudly and specifically on a missing or placeholder-looking
production-required setting, rather than falling back to a safe-looking
default.

| Variable | Meaning |
|---|---|
| `IDP_ISSUER` | The canonical public URL — the `iss` claim baked into every token. Development typically points at localhost; production must be the real HTTPS origin. |
| `DATABASE_URL` | The identity provider's own database. The loader should refuse to boot on an ambient value the environment file itself did not define — see [§7](#7-troubleshooting). |
| `COOKIE_KEYS` | Session-cookie signing keys, comma-separated. Rotate by prepending a new key and leaving the old one in place until every live session has re-signed. |
| `TOTP_ENCRYPTION_KEY` | Encrypts stored MFA secrets at rest. **Changing it locks every enrolled user out of MFA** — see [§6](#6-backups). |
| `AUDIT_HMAC_KEY` | Keys the admin audit hash chain. |
| Directory-service variables (e.g. `LDAP_*`) | Enable directory-backed authentication. Leave empty for a local-user-store-only deployment. |
| Per-relying-party client secrets | One per registered OIDC client. Production should refuse to start on any development-default secret value. |
| A relying party's own runtime secret (e.g. a bridged app's JWT signing secret) | **Must exactly match** that app's own configured secret, or every bridged token is rejected on that app's side. |
| A relying party's internal API base URL and key | Used by the identity provider to call into that app's own internal API — for example, to mint a bridged session or manage role assignments. |
| A shared cache URL (e.g. `REDIS_URL`) | Optional. Backs a shared rate-limit store across more than one process. |
| `ENABLE_API_DOCS` | Whether to expose interactive API documentation in production. Off by default — turn on deliberately, not as a leftover from debugging. |

---

## 4. Signing keys

Signing keys are stored in the identity provider's own database. Exactly
one is active at a time — that's the key used to sign new tokens. The
JWKS endpoint publishes the active key **plus** any key retired within an
overlap window (roughly the longest token lifetime the provider issues,
plus a safety margin), so a token signed moments before a rotation still
verifies for its natural lifetime.

Both operations below should take effect **live**, with no restart
required — an identity provider is exactly the kind of shared dependency
where a restart-to-rotate cost is unacceptable.

**Rotate** (the routine, scheduled operation): generates a new key, makes
it active, and marks the previous one retired. The retired key stays
published for the overlap window. This costs nobody a login.

**Withdraw immediately** (the emergency operation): removes a key from
the JWKS right away, ahead of its normal overlap window. **Every token
still signed with that key stops verifying at once, and every affected
user must sign in again.** That's the point — this is the action for a
key believed compromised, not for routine housekeeping. Rotate first;
withdraw only the key you've already rotated away from, unless you
specifically believe the *active* key itself is compromised.

Verify what relying parties can actually see at any time by fetching the
provider's own JWKS and discovery document directly.

---

## 5. Sessions and the audit chain

**Sessions.** An admin console should let an operator list live sessions
and revoke one — revoking should act on the live session store directly,
which has a real consequence for point-in-time restores (see
[§6](#6-backups): a restored database reintroduces whatever sessions were
live at backup time). A per-user "sign out everywhere" action is a useful
minimum for an admin console to expose.

Give users the same self-service capability for their own account:
enrolling MFA, listing and individually revoking their own sessions,
reviewing their own sign-in history, and changing their own password if
their account isn't sourced from a directory service.

**Audit chain.** Keep the admin audit log hash-chained: each row's hash
covers the previous row's, so an edit or deletion anywhere breaks
verification from that point on. Run the verification check periodically,
both as a script and as a live admin-console action. **A broken chain
means rows were altered outside the application — treat that as a
security incident, not a data-quality problem.**

**Retention.** A background job should periodically purge expired OIDC
artifacts and stale sessions, and a separate job should re-sync directory
group membership for users with a live session on some regular interval,
so a group-membership change takes effect within that interval rather
than waiting for the session to naturally expire.

---

## 6. Backups

Every production identity-provider deployment needs a scheduled database
backup with a defined retention period, and — just as important — a
tested restore procedure, not just a backup file assumed to be good.
Offset the backup schedule from other systems' backup jobs on the same
host so multiple database dumps aren't competing for the same disk at the
same moment.

**Treat any backup or restore script as security-relevant code.** A
backup script that silently fails — throws on an unrelated bug before
doing any real work, or gets pointed at the wrong database by an
environment-loading mistake — can report success while producing nothing
useful, for a long time, before anyone notices. After any change to
backup tooling, verify a real, restorable file actually lands; never
trust an exit code alone.

**The identity provider's own database deserves the platform's most
conservative backup posture.** Losing any one relying party's data loses
that system; losing the identity provider's database severs every
integrated system's authentication path simultaneously.

Keep any encryption or signing keys used for stored secrets (an
MFA-secret encryption key, an audit-chain signing key) somewhere durable
and **separate from the backup itself**. A restored database without the
original key that encrypted a given column means that data is
permanently unrecoverable from the dump alone, no matter how recent or
complete it is — a lost MFA-secret encryption key, specifically, means
every enrolled user must re-enroll their authenticator from scratch.

---

## 7. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| The identity provider connects to a database you didn't configure | A machine-wide `DATABASE_URL` left over from an unrelated project or trial deployment is silently winning over the service's own environment file. The configuration loader should refuse to boot on an ambient value the environment file did not itself define — check the machine's actual environment variables. |
| Everything works, but tokens carry a development-looking issuer | The service started outside production mode and loaded the development environment file. Run the production config-verification script and check which file it reports reading. |
| A bridged relying party rejects a freshly issued token | That app's configured runtime secret doesn't match what the identity provider is signing with. |
| A relying party's callback fails on first login | Its own cache/queue dependency (Redis, for instance) may be down and its nonce check is fail-closed, or its own group-to-role mapping table has no row for that user's group. |
| Every user's MFA suddenly fails | The MFA-secret encryption key doesn't match the key the secrets were originally encrypted with. Restore the previous key rather than letting users burn through lockout attempts — MFA lockout is real and will lock accounts out further. |
| A relying party rejects freshly issued tokens across the board | A signing key was withdrawn rather than rotated, or that relying party has cached the JWKS response longer than it should. Check which keys are currently published. |
| A public/guest flow can't reach an app | It should be using that app's own native public flow — a guest or public flow is a business flow specific to that app, not an identity-provider flow, and should never be routed through the bridge. |
| A path under the portal's own base path 404s in production | The frontend was built without its production base path set. It's baked in at build time — rebuild, don't just restart. |
| The plain framework "start" command serves nothing | The frontend is a standalone-output build and can't be served that way — use the project's own start script, which runs the standalone launcher. |
