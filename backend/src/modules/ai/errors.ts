// =============================================================================
// AI features — provider failure mapping.
// One place converts ProviderError categories into the HTTP contract used by
// every AI endpoint (form assistant, writing assistant, analysis, data ask).
// =============================================================================

import { AppError } from '../../utils/errors';
import { ProviderError } from './providers';

export function toAppError(err: unknown): AppError {
  if (err instanceof ProviderError) {
    switch (err.category) {
      case 'not-configured':
      case 'unavailable':
      case 'network':
        return new AppError(503, 'AI_PROVIDER_UNAVAILABLE', err.message);
      case 'timeout':
        return new AppError(504, 'AI_TIMEOUT', err.message);
      case 'rate-limited':
        return new AppError(429, 'AI_RATE_LIMITED', err.message);
      case 'malformed-response':
      case 'invalid-action':
        return new AppError(422, 'AI_MALFORMED_RESPONSE', err.message);
      case 'provider-error':
        return new AppError(502, 'AI_PROVIDER_ERROR', err.message);
      default:
        return new AppError(500, 'AI_INTERNAL_ERROR', err.message);
    }
  }
  if (err instanceof AppError) return err;
  return new AppError(500, 'AI_INTERNAL_ERROR', 'Unexpected error in the AI assistant');
}
