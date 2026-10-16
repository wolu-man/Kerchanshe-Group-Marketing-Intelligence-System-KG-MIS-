// =============================================================================
// AI Renewal — HTTP routes for provider key validation, renewal, and rotation.
// =============================================================================

import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/http';
import { AppError } from '../../utils/errors';
import { audit } from '../../db/audit';
import { providerStatuses, PROVIDERS } from '../ai/providers';
import { getConfigStore, AI_CONFIG_KEYS } from '../../config/config-store';
import { updateAiConfig } from '../../config/env';
import { logger } from '../../config/logger';

type RenewableProvider = 'gemini' | 'groq';

const RENEWABLE_PROVIDERS: RenewableProvider[] = ['gemini', 'groq'];

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

// Per-provider mutex to serialize concurrent updates
const providerLocks = new Map<RenewableProvider, Promise<void>>();

async function withProviderLock<T>(provider: RenewableProvider, fn: () => Promise<T>): Promise<T> {
  const existing = providerLocks.get(provider);
  let resolveLock: (v: void) => void;
  const lockPromise = new Promise<void>((resolve) => { resolveLock = resolve; });

  // Chain after existing lock if any
  const chained = existing ? existing.then(() => lockPromise) : lockPromise;
  providerLocks.set(provider, chained);

  try {
    return await fn();
  } finally {
    resolveLock!();
    // Clean up if this was the last lock
    if (providerLocks.get(provider) === chained) {
      providerLocks.delete(provider);
    }
  }
}

const validateSchema = z.object({
  provider: z.enum(['gemini', 'groq']),
  apiKey: z.string().min(1).max(500),
});

const applySchema = z.object({
  provider: z.enum(['gemini', 'groq']),
  apiKey: z.string().min(1).max(500),
});

const rotationSchema = z.object({
  enabled: z.boolean(),
  intervalDays: z.number().int().positive().max(365).optional(),
  provider: z.enum(['gemini', 'groq']).optional(),
  nextRun: z.string().datetime().optional(), // ISO 8601
});

const router = Router();
router.use(requireAuth);

// GET /api/v1/ai/renewal/providers/status - Get current provider statuses
router.get(
  '/providers/status',
  can('ai.renewal'),
  asyncHandler(async (_req, res) => {
    const providers = await providerStatuses();
    res.json({ providers });
  })
);

// POST /api/v1/ai/renewal/validate - Validate a provider API key without saving
router.post(
  '/validate',
  can('ai.renewal'),
  validate(validateSchema),
  asyncHandler(async (req, res) => {
    const { provider, apiKey } = req.body as { provider: RenewableProvider; apiKey: string };

    if (!RENEWABLE_PROVIDERS.includes(provider)) {
      throw new AppError(400, 'INVALID_PROVIDER', 'Provider must be gemini or groq');
    }

    const providerInstance = PROVIDERS[provider];
    if (!providerInstance) {
      throw new AppError(400, 'INVALID_PROVIDER', 'Provider not available');
    }

    // Temporarily override the key for validation
    const originalKey = provider === 'gemini'
      ? process.env.GEMINI_API_KEY
      : process.env.GROQ_API_KEY;

    try {
      // Set the test key in process.env so the provider's status() picks it up
      if (provider === 'gemini') {
        process.env.GEMINI_API_KEY = apiKey;
      } else {
        process.env.GROQ_API_KEY = apiKey;
      }

      const status = await providerInstance.status();

      // Restore original key
      if (provider === 'gemini') {
        process.env.GEMINI_API_KEY = originalKey ?? '';
      } else {
        process.env.GROQ_API_KEY = originalKey ?? '';
      }

      if (!status.configured) {
        return res.json({ valid: false, error: 'Key not configured', detail: status.detail });
      }

      if (!status.available) {
        // Distinguish error types
        const detail = status.detail || 'Provider unavailable';
        let errorCode = 'PROVIDER_UNAVAILABLE';
        let userMessage = detail;

        if (detail.toLowerCase().includes('rate limit') || detail.includes('429')) {
          errorCode = 'RATE_LIMITED';
          userMessage = 'Rate limit reached — try again shortly. The key may be valid but quota is exhausted.';
        } else if (detail.toLowerCase().includes('key was rejected') || detail.toLowerCase().includes('401') || detail.toLowerCase().includes('403')) {
          errorCode = 'INVALID_CREDENTIALS';
          userMessage = `The ${provider === 'gemini' ? 'Gemini' : 'Groq'} API key was rejected. Please verify the key.`;
        } else if (detail.toLowerCase().includes('model') && detail.toLowerCase().includes('not available')) {
          errorCode = 'MODEL_UNAVAILABLE';
          userMessage = detail;
        } else if (detail.toLowerCase().includes('timeout') || detail.toLowerCase().includes('did not respond')) {
          errorCode = 'TIMEOUT';
          userMessage = `Cannot reach ${provider === 'gemini' ? 'Gemini' : 'Groq'} — provider timeout.`;
        } else if (detail.toLowerCase().includes('cannot reach') || detail.toLowerCase().includes('network')) {
          errorCode = 'NETWORK_ERROR';
          userMessage = `Cannot reach ${provider === 'gemini' ? 'Gemini' : 'Groq'} — network error.`;
        }

        return res.json({
          valid: false,
          error: userMessage,
          errorCode,
          detail: status.detail,
        });
      }

      res.json({ valid: true, model: status.model, detail: 'Connection successful' });
    } catch (err) {
      // Restore original key on error
      if (provider === 'gemini') {
        process.env.GEMINI_API_KEY = originalKey ?? '';
      } else {
        process.env.GROQ_API_KEY = originalKey ?? '';
      }

      logger.warn('ai.renewal.validate_error', { provider, error: (err as Error).message });
      throw new AppError(500, 'VALIDATION_ERROR', 'Failed to validate key');
    }
  })
);

// POST /api/v1/ai/renewal/apply - Validate and persist a new API key
router.post(
  '/apply',
  can('ai.renewal'),
  validate(applySchema),
  asyncHandler(async (req, res) => {
    const { provider, apiKey } = req.body as { provider: RenewableProvider; apiKey: string };
    const userId = req.user!.userId;

    await withProviderLock(provider, async () => {
      // Validate first
      const providerInstance = PROVIDERS[provider];
      if (!providerInstance) {
        throw new AppError(400, 'INVALID_PROVIDER', 'Provider not available');
      }

      const originalKey = provider === 'gemini'
        ? process.env.GEMINI_API_KEY
        : process.env.GROQ_API_KEY;

      try {
        // Set test key for validation
        if (provider === 'gemini') {
          process.env.GEMINI_API_KEY = apiKey;
        } else {
          process.env.GROQ_API_KEY = apiKey;
        }

        const status = await providerInstance.status();

        // Restore original key temporarily
        if (provider === 'gemini') {
          process.env.GEMINI_API_KEY = originalKey ?? '';
        } else {
          process.env.GROQ_API_KEY = originalKey ?? '';
        }

        if (!status.available) {
          const detail = status.detail || 'Provider unavailable';
          let errorCode = 'PROVIDER_UNAVAILABLE';

          if (detail.toLowerCase().includes('rate limit') || detail.includes('429')) {
            errorCode = 'RATE_LIMITED';
          } else if (detail.toLowerCase().includes('key was rejected') || detail.toLowerCase().includes('401') || detail.toLowerCase().includes('403')) {
            errorCode = 'INVALID_CREDENTIALS';
          } else if (detail.toLowerCase().includes('timeout') || detail.toLowerCase().includes('did not respond')) {
            errorCode = 'TIMEOUT';
          } else if (detail.toLowerCase().includes('cannot reach') || detail.toLowerCase().includes('network')) {
            errorCode = 'NETWORK_ERROR';
          }

          throw new AppError(400, errorCode, detail);
        }

        // Validation passed - persist the key
        const configStore = getConfigStore();
        const envKey = provider === 'gemini' ? AI_CONFIG_KEYS.GEMINI_API_KEY : AI_CONFIG_KEYS.GROQ_API_KEY;

        await configStore.set(envKey, apiKey);

        // Update runtime config so subsequent requests use the new key
        if (provider === 'gemini') {
          updateAiConfig({ geminiApiKey: apiKey });
        } else {
          updateAiConfig({ groqApiKey: apiKey });
        }

        // Audit log (no key material)
        await logAudit(req, {
          userId,
          action: 'AI_KEY_RENEWED',
          entity: 'AiProvider',
          detail: { provider, rotated: false },
        });

        logger.info('ai.renewal.applied', { provider, userId });

        // Verify the new key works
        const newStatus = await providerInstance.status();

        res.json({
          success: true,
          provider,
          model: newStatus.model,
          status: newStatus.available ? 'available' : 'configured',
          message: `${provider === 'gemini' ? 'Gemini' : 'Groq'} API key updated successfully`,
        });
      } catch (err) {
        // Restore original key on error
        if (provider === 'gemini') {
          process.env.GEMINI_API_KEY = originalKey ?? '';
        } else {
          process.env.GROQ_API_KEY = originalKey ?? '';
        }
        throw err;
      }
    });
  })
);

// GET /api/v1/ai/renewal/rotation - Get rotation configuration
router.get(
  '/rotation',
  can('ai.renewal'),
  asyncHandler(async (_req, res) => {
    const configStore = getConfigStore();

    const [enabled, intervalDays, nextRun, rotationProvider, due] = await Promise.all([
      configStore.get(AI_CONFIG_KEYS.ROTATION_ENABLED),
      configStore.get(AI_CONFIG_KEYS.ROTATION_INTERVAL_DAYS),
      configStore.get(AI_CONFIG_KEYS.ROTATION_NEXT_RUN),
      configStore.get(AI_CONFIG_KEYS.ROTATION_PROVIDER),
      configStore.get(AI_CONFIG_KEYS.ROTATION_DUE),
    ]);

    res.json({
      enabled: enabled === 'true',
      intervalDays: intervalDays ? parseInt(intervalDays, 10) : null,
      nextRun: nextRun || null,
      provider: (rotationProvider as RenewableProvider) || null,
      due: due === 'true',
    });
  })
);

// PUT /api/v1/ai/renewal/rotation - Update rotation configuration
router.put(
  '/rotation',
  can('ai.renewal'),
  validate(rotationSchema),
  asyncHandler(async (req, res) => {
    const { enabled, intervalDays, provider: rotationProvider, nextRun } = req.body as z.infer<typeof rotationSchema>;
    const userId = req.user!.userId;

    const configStore = getConfigStore();

    await configStore.set(AI_CONFIG_KEYS.ROTATION_ENABLED, String(enabled));

    if (intervalDays !== undefined) {
      await configStore.set(AI_CONFIG_KEYS.ROTATION_INTERVAL_DAYS, String(intervalDays));
    }

    if (rotationProvider !== undefined) {
      await configStore.set(AI_CONFIG_KEYS.ROTATION_PROVIDER, rotationProvider);
    }

    if (nextRun !== undefined) {
      await configStore.set(AI_CONFIG_KEYS.ROTATION_NEXT_RUN, nextRun);
    }

    // If enabling and no nextRun set, calculate it
    if (enabled && !nextRun) {
      const days = intervalDays ?? 90;
      const next = new Date();
      next.setDate(next.getDate() + days);
      await configStore.set(AI_CONFIG_KEYS.ROTATION_NEXT_RUN, next.toISOString());
    }

    // Clear due flag when config changes
    await configStore.set(AI_CONFIG_KEYS.ROTATION_DUE, 'false');

    await logAudit(req, {
      userId,
      action: 'AI_ROTATION_CONFIG_UPDATED',
      entity: 'AiProvider',
      detail: { enabled, intervalDays, provider: rotationProvider, nextRun },
    });

    logger.info('ai.renewal.rotation_updated', { userId, enabled, intervalDays, provider: rotationProvider });

    res.json({ success: true });
  })
);

export { router as aiRenewalRouter };