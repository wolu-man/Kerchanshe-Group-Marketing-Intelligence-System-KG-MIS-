// =============================================================================
// Data Quality / Confidence — field-presence scoring for an opportunity
// (Opurtunities_Plan.md §6, §8, §19).
//
// Confidence is a deterministic 0-100 completeness score computed from the
// source-provided fields only (AI never changes the source-presence part of
// the score beyond extracted-value presence — see ai-enrichment.ts).
// DataQuality is a coarse label derived from the score so it can be filtered.
// The formulas are mirrored by the SQL backfill in migration 047.
// =============================================================================

export const DATA_QUALITY_LEVELS = ['Complete', 'Partial', 'Sparse'] as const;
export type DataQuality = (typeof DATA_QUALITY_LEVELS)[number];

export interface QualityInput {
  organization?: string | null;
  deadlineDate?: Date | string | null;
  publicationDate?: Date | string | null;
  country?: string | null;
  sector?: string | null;
  estimatedValue?: number | string | null;
  description?: string | null;
}

function present(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

/** Field-presence confidence, 0-100. Mirrors the SQL backfill in migration 047. */
export function computeConfidence(input: QualityInput): number {
  let score = 0;
  if (present(input.organization)) score += 20;
  if (input.deadlineDate) score += 20;
  if (input.publicationDate) score += 15;
  if (present(input.country)) score += 10;
  if (present(input.sector)) score += 10;
  if (input.estimatedValue != null && input.estimatedValue !== '') score += 15;
  if ((input.description || '').length >= 200) score += 10;
  return Math.min(100, score);
}

/** Coarse label derived from the confidence score. */
export function computeDataQuality(confidence: number): DataQuality {
  if (confidence >= 70) return 'Complete';
  if (confidence >= 40) return 'Partial';
  return 'Sparse';
}

export function isDataQuality(value: unknown): value is DataQuality {
  return typeof value === 'string' && (DATA_QUALITY_LEVELS as readonly string[]).includes(value);
}
