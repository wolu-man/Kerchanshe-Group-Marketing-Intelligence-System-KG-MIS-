// =============================================================================
// AI assistant — shared friendly error mapping for every AI surface
// (form builder drawer, writing assistant, response analysis, data ask).
// =============================================================================

import { ApiError } from '@/lib/api';

export function friendlyAiError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'AI_PROVIDER_UNAVAILABLE':
        return `${err.message}`;
      case 'AI_TIMEOUT':
        return 'The AI provider took too long to answer. Please try again.';
      case 'AI_RATE_LIMITED':
      case 'RATE_LIMITED':
        return 'Too many AI requests right now — please wait a moment.';
      case 'AI_MALFORMED_RESPONSE':
        return 'The model returned something the assistant could not use. Please rephrase.';
      case 'AI_UNKNOWN_TOOL':
        return 'The assistant tried an unsupported query. Please rephrase your question.';
      case 'AI_QUERY_FAILED':
        return 'That data could not be read right now. Please try again.';
      case 'FORBIDDEN':
        return 'You do not have access to this AI feature.';
      case 'NETWORK_ERROR':
        return 'Cannot reach the API server.';
      default:
        return err.message || 'Something went wrong.';
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
