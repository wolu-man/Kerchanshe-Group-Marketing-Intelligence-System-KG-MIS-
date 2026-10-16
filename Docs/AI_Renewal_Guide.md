# AI Renewal Feature — Implementation Guide

## Overview

The AI Renewal feature allows authorized Administrators to replace exhausted or invalid Gemini and Groq API keys, verify provider connectivity, and configure scheduled key rotation reminders — all without requiring a full application restart.

## Architecture

### Backend Components

| Component | Purpose |
|-----------|---------|
| `config-store.ts` | Abstraction for configuration storage (`.env` in dev, `SystemConfig` table in prod) |
| `env.ts` (updated) | Mutable `env.ai` config with `updateAiConfig()` for runtime key updates |
| `ai-renewal.routes.ts` | REST endpoints for validation, renewal, and rotation config |
| `jobs.ts` (updated) | Daily cron job (`0 2 * * *`) to check rotation due dates |
| `permissions.ts` (updated) | `ai.renewal` permission restricted to `Administrator` role |

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `Sidebar.tsx` (updated) | Added "AI Renewal" menu item with `key` icon under Administration |
| `ai-renewal/page.tsx` | Main UI page with provider cards and rotation settings |

### Database

- Migration `050_ai_renewal.sql` adds SystemConfig keys for rotation tracking
- Actual API keys stored in `.env` (dev) or secret manager (prod) — **never in database**

---

## API Endpoints

All endpoints require authentication and `ai.renewal` permission (Administrator only).

### Provider Status

```
GET /api/v1/ai/renewal/providers/status
```

Returns current status of all AI providers (reuses existing `providerStatuses()`).

**Response:**
```json
{
  "providers": [
    {
      "id": "gemini",
      "label": "Google Gemini",
      "configured": true,
      "available": true,
      "model": "gemini-flash-latest",
      "detail": null
    },
    {
      "id": "groq",
      "label": "Groq",
      "configured": true,
      "available": false,
      "model": "llama-3.3-70b-versatile",
      "detail": "The Groq API key was rejected"
    }
  ]
}
```

### Validate Key

```
POST /api/v1/ai/renewal/validate
Content-Type: application/json

{
  "provider": "gemini" | "groq",
  "apiKey": "your-api-key"
}
```

Tests a key against the provider without saving. Returns detailed error codes:

| Error Code | Meaning |
|------------|---------|
| `INVALID_CREDENTIALS` | Key rejected (401/403) |
| `RATE_LIMITED` | Quota exhausted (429) — **does not overwrite working key** |
| `TIMEOUT` | Provider timeout |
| `NETWORK_ERROR` | Cannot reach provider |
| `MODEL_UNAVAILABLE` | Configured model not available for key |
| `PROVIDER_UNAVAILABLE` | Other provider errors |

**Response (valid):**
```json
{ "valid": true, "model": "gemini-flash-latest", "detail": "Connection successful" }
```

**Response (invalid):**
```json
{
  "valid": false,
  "error": "The Gemini API key was rejected. Please verify the key.",
  "errorCode": "INVALID_CREDENTIALS",
  "detail": "The Gemini API key was rejected"
}
```

### Apply/Renew Key

```
POST /api/v1/ai/renewal/apply
Content-Type: application/json

{
  "provider": "gemini" | "groq",
  "apiKey": "your-api-key"
}
```

Validates the key, then atomically persists it and updates runtime config.

**Response:**
```json
{
  "success": true,
  "provider": "gemini",
  "model": "gemini-flash-latest",
  "status": "available",
  "message": "Gemini API key updated successfully"
}
```

### Rotation Config

```
GET /api/v1/ai/renewal/rotation
PUT /api/v1/ai/renewal/rotation
```

**GET Response:**
```json
{
  "enabled": true,
  "intervalDays": 90,
  "nextRun": "2026-01-15T02:00:00.000Z",
  "provider": "gemini",
  "due": false
}
```

**PUT Request:**
```json
{
  "enabled": true,
  "intervalDays": 90,
  "provider": "gemini",
  "nextRun": "2026-01-15T02:00:00.000Z"  // optional, auto-calculated if omitted
}
```

---

## Configuration Storage

### Local Development (`.env`)

- Keys stored in `backend/.env` as `GEMINI_API_KEY` and `GROQ_API_KEY`
- `DotEnvConfigStore` performs atomic writes (temp file → rename)
- Preserves comments, formatting, and unrelated keys
- Updates `process.env` and in-memory `env.ai` immediately

### Production (Secret Manager)

Implement `ConfigStore` interface for your secret manager:

```typescript
// Example: Azure Key Vault
export class AzureKeyVaultStore implements ConfigStore {
  async get(key: string): Promise<string | null> { /* ... */ }
  async set(key: string, value: string): Promise<void> { /* ... */ }
  async getAll(): Promise<Record<string, string>> { /* ... */ }
}
```

Register in `config-store.ts` factory:

```typescript
export function getConfigStore(): ConfigStore {
  if (env.nodeEnv === 'production') {
    return new AzureKeyVaultStore(); // or AWSSecretsManagerStore, etc.
  }
  return new DotEnvConfigStore();
}
```

**SystemConfig keys (for rotation tracking only):**
- `ai.rotation.enabled` — boolean
- `ai.rotation.intervalDays` — integer (1-365)
- `ai.rotation.nextRun` — ISO 8601 datetime
- `ai.rotation.provider` — 'gemini' | 'groq'
- `ai.rotation.due` — boolean

---

## Scheduled Rotation

### How It Works

1. Admin enables rotation and sets interval (e.g., 90 days) and provider
2. System calculates `nextRun` = now + interval
3. Daily at 02:00 UTC, cron job checks if `nextRun <= now`
4. If due, sets `ai.rotation.due = true` and logs audit event
5. **Admin must manually provide new key** — system never auto-generates keys
6. After renewal, admin clears `due` flag via rotation settings

### Safety Guarantees

- No automatic key generation or rotation
- Duplicate job prevention via config flag
- Audit trail for all rotation events
- Working key preserved if validation fails

---

## Security

| Requirement | Implementation |
|-------------|----------------|
| Keys never in frontend | Backend-only validation; frontend only sends new key to API |
| Keys never in logs/audit | `config-store.ts` redacts secrets; audit detail excludes keys |
| Keys never in URLs | POST bodies only |
| Atomic writes | Temp file → `fs.rename()` (POSIX atomic) |
| Runtime refresh | Providers read `env.ai.*.apiKey` at request time |
| Rollback on failure | ConfigStore validates before commit; old key remains active |
| CSRF protection | JWT in `Authorization` header (stateless) |
| Admin-only access | `ai.renewal` permission → `Administrator` role only |
| Per-provider locking | Mutex serializes concurrent updates |

---

## Testing

### Unit Tests

Run backend tests:
```bash
cd backend
npx tsx src/modules/ai/ai-renewal.test.ts
```

Tests cover:
- DotEnvConfigStore: get/set, overwrite, preserve comments, preserve other keys
- AI_CONFIG_KEYS constants
- Renewable provider allowlist

### Manual Test Checklist

| Scenario | Expected |
|----------|----------|
| Valid Gemini key | Persists, status → `available`, subsequent AI requests work |
| Valid Groq key | Persists, status → `available`, subsequent AI requests work |
| Invalid key (401) | Rejected, old key active, error: "The [Gemini/Groq] API key was rejected" |
| Rate limit (429) | Rejected **without overwriting**, error: "Rate limit reached — try again shortly" |
| Provider outage (5xx) | Rejected **without overwriting**, error: "Provider temporarily unavailable" |
| Non-Admin user | 403 Forbidden |
| Concurrent renewals | Serialized per provider, last write wins |
| Failed `.env` write | Rollback, old key works, error reported |
| Rotation due job | Sets `ai.rotation.due = true`, audit logged, no key generated |
| Secret redaction | Keys absent from API responses, logs, audit, URLs |

---

## Deployment

### Local Development

1. Copy `backend/.env.example` to `backend/.env`
2. Add your keys:
   ```
   GEMINI_API_KEY=your-gemini-key
   GROQ_API_KEY=your-groq-key
   ```
3. Run migrations: `npm run db:migrate`
4. Start backend: `npm run dev`
5. Start frontend: `npm run dev` (in frontend directory)
6. Navigate to `/admin/ai-renewal` as Administrator

### Production

1. Set up secret manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault)
2. Implement `ConfigStore` for your secret manager
3. Run migration `050_ai_renewal.sql` to add rotation config keys
4. Configure environment variables for secret manager access
5. Deploy backend and frontend

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes (if using Gemini) | Google AI Studio API key |
| `GROQ_API_KEY` | Yes (if using Groq) | Groq Console API key |
| `AI_PROVIDER` | No | Default provider: `auto`, `ollama`, `gemini`, `groq` |
| `AI_TIMEOUT_MS` | No | Per-request timeout (default: 60000) |

---

## Key Acquisition URLs

- **Gemini**: https://aistudio.google.com/apikey
- **Groq**: https://console.groq.com/keys

---

## Troubleshooting

### "Provider unavailable" after key update

1. Verify key is valid at provider console
2. Check model name in `.env` (`GEMINI_MODEL`, `GROQ_MODEL`) matches available models
3. Check network connectivity to provider APIs
4. Check backend logs for detailed error

### "Rate limited" but key is new

- Some providers have per-project or per-account quotas
- A new key may not resolve account-wide limits
- Wait for quota reset or request limit increase from provider

### Rotation not triggering

- Verify `ai.rotation.enabled = true` in SystemConfig
- Check `ai.rotation.nextRun` is in the past
- Check cron job is running (see logs for "Scheduled job registered: AI key rotation check")
- Verify `node-cron` is active in production process

### Frontend shows old status after renewal

- Refresh the page — status is fetched on load
- Check browser console for API errors
- Verify backend `providerStatuses()` reflects new key

---

## Files Changed

### Backend

| File | Change |
|------|--------|
| `src/security/permissions.ts` | Added `ai.renewal` permission |
| `src/config/config-store.ts` | **New** — ConfigStore abstraction |
| `src/config/env.ts` | Added mutable `aiConfig` and `updateAiConfig()` |
| `src/modules/ai/ai-renewal.routes.ts` | **New** — Renewal API endpoints |
| `src/app.ts` | Registered `aiRenewalRouter` |
| `src/cron/jobs.ts` | Added `checkAiKeyRotation()` cron job |
| `migrations/050_ai_renewal.sql` | **New** — SystemConfig keys for rotation |

### Frontend

| File | Change |
|------|--------|
| `src/components/Sidebar.tsx` | Added AI Renewal menu item |
| `src/app/admin/ai-renewal/page.tsx` | **New** — Renewal UI page |
| `src/components/ui.tsx` | Added `Input` component |

### Tests

| File | Change |
|------|--------|
| `src/modules/ai/ai-renewal.test.ts` | **New** — Unit tests |

---

## Limitations & Future Work

1. **Ollama excluded** — No API key to rotate (local model)
2. **Single provider rotation** — Only one provider can be tracked at a time
3. **No notifications** — Rotation due events only logged; consider integrating with notification system
4. **Secret manager** — Production implementation requires custom `ConfigStore`
5. **Key expiration detection** — Currently only rotation schedule; could add provider-specific expiry checking

---

## Rollback Procedure

If issues arise after deployment:

1. Revert backend code changes
2. Run migration rollback (delete SystemConfig keys if needed)
3. Restore previous `.env` file from backup
4. Restart backend service