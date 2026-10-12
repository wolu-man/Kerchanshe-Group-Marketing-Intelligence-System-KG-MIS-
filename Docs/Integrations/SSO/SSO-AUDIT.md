# SSO — Full Audit (2026-09-04)

**What SSO is, and why the bar is different.** SSO is the identity provider for
the platform. DMS and GMS both delegate authentication to it, and the portal is
where users start. Every other system's failure is that system's failure; SSO's
failure is everyone's. That framing decides the severity of several items below
that would be P2s in an application.

**Scope.** `SSO/backend/src` (all 58 TypeScript files: OIDC provider config,
interaction/login flow, portal, admin console and its two APIs, the GMS token
bridge and gateway, auth primitives, config guards, database layer),
`SSO/frontend` (all 18 routes, the API layer, the shared components),
`SSO/backend/scripts`, all four `.env*` files, and the Apache vhost as it
concerns `/sso`.

**Method.** Every backend route was enumerated and matched against what the
frontend actually calls, to answer the "is the UI missing anything the backend
can do" question directly rather than by impression. The auth primitives
(password hashing, TOTP, lockout, session revocation, CSRF, CSP, the bridge
handoff) were read in full. Findings were fixed in the same session and are
marked accordingly; nothing below is a proposal.

**Headline.** SSO is in materially better shape than GMS was. It has been
through several prior hardening passes and it shows: constant-time comparisons
throughout, timing-equalised login failures, TOTP replay high-water marks,
scrypt with in-band cost parameters and transparent re-hashing, a
binding-cookie-protected one-time bridge handoff, an HMAC-chained audit log,
and a production boot guard that refuses to start on placeholder secrets.

The findings are concentrated in one place instead: **things the backend can do
that no user interface could reach.** That is a specific and consistent failure
mode here — capability was built, tested, audited, wired to the audit log, and
then never given a button. An operator cannot use a control they cannot see, so
in practice those capabilities did not exist.

---

## Severity

- **P0** — data loss, or an authentication/authorization bypass reachable by
  an ordinary user.
- **P1** — an operational control that does not exist in practice, or a
  security control that cannot be exercised when it is needed.
- **P2** — hardening, correctness, or clarity.

---

## P0

### SSO-P0-1 — The identity database had never once been backed up · **FIXED**

**Where:** `SSO/backend/scripts/db-backup.ts:28`

The package is `"type": "module"`. The script used `__dirname`, which does not
exist in an ES module, so it threw
`ReferenceError: __dirname is not defined in ES module scope` on its first line
of real work — before loading any config, before reaching Postgres. It had
never produced a backup, and it never would have.

The severity is not the bug, which is trivial. It is that
`SERVER-DEPLOYMENT-TODO.md` §1 describes all three systems' backup scripts as
"**working**" and says they merely need registering as Windows Scheduled Tasks.
Following that instruction registers a task that fails silently every night. In
Task Scheduler, a task whose command exits non-zero and one that works look the
same at a glance. The failure would have been discovered on the day
`idpprod` was needed back — which, for the identity provider, is the day nobody
can sign in to anything.

DMS's copy had the identical fault, found the day before. GMS's is CommonJS and
was verified working.

**Fixed:** `fileURLToPath(import.meta.url)`, and the script was run to a real
dump file rather than merely made to compile. `SERVER-DEPLOYMENT-TODO.md` §1
now carries the correction and the general rule: run each backup by hand and
look at the file before registering anything.

---

## P1

### SSO-P1-1 — Signing key rotation existed but had no button · **FIXED**

**Where:** `api/v1/admin-mutations.router.ts:235,263`, `jwks.ts:114`,
`frontend/app/admin/keys/page.tsx`

`POST /api/v1/admin/keys/generate` and `POST /api/v1/admin/keys/:kid/retire`
were fully implemented: CSRF-checked, audited, and calling `reloadProviderKeys`
so a rotation takes effect on the running provider without a restart. `GET
/admin/keys` even returned a CSRF token, which only makes sense for a page that
mutates. No such page existed. The Keys screen was a read-only table.

Key rotation is the one control an identity provider must have on the day a key
is suspected compromised, and the only way to exercise it was to hand-craft an
authenticated request with a valid CSRF cookie — under time pressure, during an
incident, from a console that gives no hint the capability exists.

**A second, worse problem underneath it.** `retireSigningKey` could not succeed.
It only demoted rows where `is_active = TRUE`, while guarding against retiring
"the newest active key". `rotateSigningKey` demotes every active row before
inserting the new one, so exactly one key is ever active — and that one key is
always the newest, which the guard refuses. Every possible call returned either
"rotate first" or "not found or already retired". It was unreachable code that
read as a working feature.

The operation an operator actually needs is different from what the function
attempted. After a rotation the outgoing key stays published in the JWKS for
`RETIRED_KEY_OVERLAP_SECONDS` so tokens signed moments earlier keep verifying —
correct for a routine rotation, and exactly wrong when the key leaked. There
was no way to withdraw it early, so a compromised key remained trusted by DMS,
GMS and the portal for the rest of that window.

**Fixed:** `retireSigningKey` now handles both cases — it demotes a stray extra
active row (the broken state `loadSigningJwks` already logs an alert for), and
otherwise backdates `retired_at` clear of the overlap so the key leaves the
JWKS on the reload that immediately follows. `listSigningKeys` returns a
`published` flag, because "retired" and "no longer trusted" are different states
and the console was showing only the first. The Keys page has "Rotate signing
key" and a per-key "Withdraw now", each with a confirmation that states the
actual consequence — rotation signs nobody out; withdrawal does.

### SSO-P1-2 — The audit log's tamper-evidence was never checkable · **FIXED**

**Where:** `admin/audit.ts:341` (`verifyAuditChain`), `admin/router.ts:1288`,
`api/v1/admin.router.ts`, `frontend/app/admin/audit/page.tsx`

`idp_admin_audit` is a hash chain: each row carries an HMAC over the previous
row's hash, so edits are detectable. `verifyAuditChain()` recomputes the whole
chain in bounded batches and reports the first mismatch.

It was reachable only through `GET /admin/audit/verify` on the **legacy EJS
console**, which is mounted on the backend's own port and is not routed through
Apache. In production nobody can reach it. The React console — the only admin
surface anyone uses — displayed audit rows and had no way to say whether they
were still trustworthy.

An audit log whose integrity cannot be checked is decoration. The chain was
being maintained correctly and nothing was ever going to read it.

**Fixed:** `GET /api/v1/admin/audit/verify` (read-only, no CSRF — it has no side
effects), and a "Verify integrity" control on the audit page that reports how
many entries were recomputed, the sequence range covered, how many pre-date the
chain, and where the first mismatch is if there is one. Deliberately on demand
rather than on page load: it walks the whole table.

### SSO-P1-3 — "Kill session" silently revoked the entire account · **FIXED**

**Where:** `api/v1/admin-mutations.router.ts:179`,
`frontend/app/admin/sessions/page.tsx`

`POST /api/v1/admin/sessions/revoke` looks the account up from the session row
and calls `revokeAllSessions` — every session, access token, refresh token,
grant and GMS bridge session, on every device. That is correct, and the code
says why: tokens and grants are only ever tracked per account, so no narrower
primitive exists.

The button said **"Kill"**, in a row identified by a session id, under a page
header describing per-session behaviour, with a confirmation reading "Kill this
session? The user will be signed out." An administrator clearing what looked
like one stale desktop session was in fact signing that person out of DMS, GMS
and the portal everywhere — during their working day, with no warning that this
was the scope.

This is a UI honesty defect with a real operational cost, and it cuts the other
way too: an administrator who *needed* account-wide revocation had no reason to
believe this button provided it.

**Fixed:** the button reads "Sign out everywhere", the confirmation names the
person and enumerates what is revoked, and the page description states the
scope. No behaviour changed — the behaviour was already right.

---

## P2

### SSO-P2-1 — A user's name could not be corrected · **FIXED**

`PUT /api/v1/admin/users/:id` has always accepted `given_name`, `family_name`
and `is_active`, with a thoughtful detail: setting `is_active: false` revokes
sessions and writes the dedicated `user.disable` audit action rather than a
generic update. Nothing in the console ever called it. The only user mutation
the UI offered was the separate toggle-active endpoint.

So a name typed wrong at account creation could not be fixed from the admin
console — and that name is what DMS and GMS display after they JIT-provision
the account from the id_token, so the error propagates and persists.

**Fixed:** a Profile card on the user detail page, with a note that the email
address is the cross-system identity and deliberately not editable here.

### SSO-P2-2 — Dead MRS and retail-os configuration · **FIXED**

`MRS_CLIENT_SECRET`, `MRS_REDIRECT_URIS`, `MRS_LOGOUT_URIS` and
`MRS_SSO_LOGIN_URL` were present in all four SSO env files, including a real
64-character production secret in `.env.production`. `RETAIL_CLIENT_SECRET`,
`RETAIL_REDIRECT_URIS` and `RETAIL_LOGOUT_URIS` sat beside them with another
real production secret.

**No SSO source file read any of them.** `clientSeed` was already down to
`edams`, `gms` and `portal`. Both were live secrets for clients that do not
exist, in files that are copied forward between environments, next to variables
that do matter — an invitation to re-add a system that two separate decisions
had removed (`CLAUDE.md` explicitly says not to re-add retail-os).

**Fixed:** removed from `.env`, `.env.example`, `.env.production` and
`.env.production.example`, along with the `/mrs` proxy block in
`apache/conf/extra/httpd-ssl.conf` — replaced with a note explaining why it must
not come back (with nothing listening, a leftover `ProxyPass` yields 503, which
reads as a broken platform rather than a retired system).

### SSO-P2-3 — Three CSS classes referenced with no rule · **FIXED**

`badge`, `.sso-button.secondary` and `.sso-button.danger` were used by several
pages and had no matching CSS anywhere, so those pills and buttons rendered
completely unstyled — including the destructive-action buttons, which were
indistinguishable from ordinary ones. `.admin-hint` was the same. Fixed as part
of the frontend rebuild.

### SSO-P2-4 — Password policy is length-only

`hashPassword`/`verifyPassword` are strong (scrypt at N=2¹⁷ with cost
parameters stored in-band, so the cost can be raised later; bcrypt accepted
read-only for hashes mirrored from GMS; transparent re-hash on next successful
login). Account lockout is 5 attempts / 15 minutes, and login failures are
timing-equalised against a cached dummy hash so response time is not an oracle
for account existence.

The policy itself is "at least 8 characters", enforced consistently at all
three write points (admin create, admin reset, self-service and forced change).
There is no check against a common-password list, which is the one composition
control NIST 800-63B does recommend. Not changed — it needs a wordlist and a
decision about where it lives, and deploy day is the wrong time. Recorded here
so it is a choice rather than an oversight.

### SSO-P2-5 — Two admin consoles are still mounted

`main.ts` mounts both the legacy EJS console at `/admin` and the React console's
API at `/api/v1/admin`. The EJS one is not reachable through Apache (only `/sso`
is proxied, to the frontend on 7301), so it is not externally exposed — but it
is a second implementation of the same authorization decisions, and it has
already drifted: `GET /admin/audit/verify` and `POST /admin/sessions/signout-user`
exist only there, which is how SSO-P1-2 happened.

Not removed — deleting a console the evening before a deployment is exactly the
kind of change that turns a deploy into an incident. Flagged for afterwards.

---

## Verified and found correct

Recorded because "we looked and it was fine" is a finding too, and because
several of these are the controls someone will ask about after an incident.

**Authentication.** Constant-time password comparison with a length guard
before `timingSafeEqual`. Cached dummy-hash timing equalisation across
"no such account", "inactive", "locked" and "wrong password". Lockout at 5/15m.
AD-sourced accounts cannot set a local password (`canSelfChangePassword`), so a
disabled or rotated AD account cannot leave a working IdP-only credential
behind. An AD identity whose email already belongs to a local row raises
`AdAccountCollisionError` rather than binding to it and handing over another
account's `sub`.

**MFA.** TOTP verification returns the matched counter rather than a boolean,
and callers persist it as a replay high-water mark — without which the ±1 skew
window makes a single observed code valid for up to 90 seconds of repeated use.
The enrollment code's own counter seeds that mark, so the code used to enroll
cannot be replayed at the login prompt seconds later. The verify loop iterates
the whole window even after matching, so timing does not reveal which step hit.
Disabling MFA requires a current unused code. An undecryptable stored secret
returns an honest error instead of burning attempts toward a lockout against a
secret the server cannot read.

**Sessions and revocation.** `revokeAllSessions` covers sessions, access and
refresh tokens, grants and the GMS bridge session. Admin password reset revokes.
Disable-via-`PUT` revokes and audits as `user.disable` rather than a generic
update.

**GMS bridge.** The one-time handoff code is bound to an httpOnly cookie whose
SHA-256 the server holds, so a code that leaks into a log, a proxy, or a
link-scanner prefetch cannot be redeemed by anything but the browser that
started the flow. TTL is 2 minutes — deliberately a bootstrap window, not a
session lifetime (it previously reused GMS's 8-hour access TTL).

**CSRF.** Double-submit, with the cookie `httpOnly` and the token delivered in
the JSON response body instead — so the token is not readable by injected
script. The API console's cookie has its own name and its own `Path`, because
the EJS console's `Path=/admin` cookie would never be sent to `/api/v1/admin`;
that class of bug is documented at both ends.

**CSP.** `script-src 'self' 'nonce-…'` with `'unsafe-inline'` deliberately
absent, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`. The
comment enumerates every HTML response this process actually emits, which is
what makes a strict policy safe to assert here.

**Production boot guards.** `assertProdSafeDefaults()` refuses to start on dev
default or `replace-with-` placeholder client secrets, placeholder cookie keys,
a placeholder TOTP encryption key, a placeholder audit HMAC secret, a missing
GMS internal API key, a dev `gms.localtest.me` gateway URL, or any localhost
redirect URI in `clientSeed`. `assertDevSafeDefaults()` is the mirror image,
catching a dev process that has resolved production resources — the
machine-wide-`DATABASE_URL` failure mode `CLAUDE.md` documents. Server-to-server
URLs are deliberately excluded from the loopback check, with the reason recorded
(they are correctly loopback on this single-host topology, and guarding them
broke a real boot once).

**Readiness.** `/health/ready` does a real `SELECT 1` and returns 503 on
failure, logging the Postgres error and returning none of it — a raw error
string names the host, database and role, and the endpoint is unauthenticated.
`/metrics` is authenticated.

**Availability.** Rate limiting uses Redis when `REDIS_URL` is set and falls
back to express-rate-limit's in-memory store otherwise, which is correct while
SSO runs a single process — as `PLATFORM-OPERATIONS-GUIDE.md` §6 records it
deliberately does on this RAM-tight server. Nothing in SSO's request path
requires Redis.

**Backend/frontend parity.** Every `/api/v1/admin` endpoint is now reached by
the console. The remaining backend-only routes are `GET /api/v1/auth/check`
(for relying parties, not this UI), `POST /users/:id/disable-mfa` (a duplicate
of `mfa-reset`, which the UI uses), `GET /simulation/*`-style legacy EJS routes,
and the internal machine-to-machine APIs under `/api/v1/internal/gms` — none of
which are user-facing gaps.

---

## State at the end of this pass

- SSO backend: `tsc` clean, 46/46 tests passing, production build succeeds.
- SSO frontend: `tsc` clean, production build succeeds, 18 routes.
- `scripts/db-backup.ts` verified by producing a real dump file.

## Open, deliberately

- **SSO-P2-4** — common-password list. Needs a wordlist and a decision.
- **SSO-P2-5** — retire the legacy EJS console. Post-deployment.
- **AD/LDAP** — unconfigured by decision, not by omission. See
  `SERVER-DEPLOYMENT-TODO.md` §6; the resync worker and AD-group role mapping
  simply have nothing to do, exactly as in dev.
