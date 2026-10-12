// =============================================================================
// AI Enrichment — generates summaries and extracts structured data from
// tender opportunities using the existing AI orchestration.
//
// Reuses the orchestrate() function from ../ai/orchestrator with a custom
// system prompt and parse function. API keys never leave the server.
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { orchestrate, extractJson } from '../ai/orchestrator';
import { ProviderError } from '../ai/providers';
import type { ToolSpec } from '../ai/systemPrompt';
import type { ChatTurn, ProviderChoice } from '../ai/ai.types';
import type { ProviderChatResult } from '../ai/providers';
import { classifyOpportunity, loadProductGroupsSafe, isOpportunityType, OPPORTUNITY_TYPES } from './classifier';
import type { OpportunityType } from './classifier';
import { scoreOpportunity } from './relevance';

// ---------------------------------------------------------------------------
// Tool spec — the model returns a JSON object with summary + structured fields
// + classification gap-fill suggestions (plan §8).
// ---------------------------------------------------------------------------

const FIELD_BASIS_VALUES = ['confirmed', 'inferred', 'uncertain', 'unavailable'] as const;
export type FieldBasis = (typeof FIELD_BASIS_VALUES)[number];

const TENDER_TOOL: ToolSpec = {
  name: 'extract_tender_info',
  description:
    'Analyze the tender/opportunity text and return a concise summary plus structured extraction. Call this tool exactly once.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: {
        type: 'string',
        description: 'A 2-4 sentence summary of the tender/opportunity, highlighting key requirements, scope, and value.',
      },
      estimatedValue: {
        type: 'string',
        description: 'The estimated contract value if mentioned, or null if unknown.',
      },
      currency: {
        type: 'string',
        description: 'The currency code (e.g. USD, ETB, EUR) if known, or null.',
      },
      eligibility: {
        type: 'string',
        description: 'Eligibility criteria (who can bid), or null if not specified.',
      },
      requiredDocuments: {
        type: 'string',
        description: 'Required submission documents, or null if not specified.',
      },
      contactInfo: {
        type: 'string',
        description: 'Contact information for inquiries, or null if not found.',
      },
      keyDates: {
        type: 'string',
        description: 'Important dates beyond the deadline (e.g. pre-bid meeting, clarification deadline), or null.',
      },
      fieldBasis: {
        type: 'object',
        additionalProperties: false,
        description:
          'For each structured field, how it was derived: confirmed (explicitly stated), inferred (strongly implied by the text), uncertain (weakly implied) or unavailable (not present).',
        properties: {
          estimatedValue: { type: 'string', enum: [...FIELD_BASIS_VALUES] },
          currency: { type: 'string', enum: [...FIELD_BASIS_VALUES] },
          eligibility: { type: 'string', enum: [...FIELD_BASIS_VALUES] },
          requiredDocuments: { type: 'string', enum: [...FIELD_BASIS_VALUES] },
          contactInfo: { type: 'string', enum: [...FIELD_BASIS_VALUES] },
          keyDates: { type: 'string', enum: [...FIELD_BASIS_VALUES] },
        },
      },
      suggestedOpportunityType: {
        type: 'string',
        enum: [...OPPORTUNITY_TYPES],
        description:
          'Classification gap fill: only when the prompt says type rules were inconclusive AND the text clearly indicates this type; otherwise null.',
      },
      suggestedProductGroup: {
        type: 'string',
        description:
          'Classification gap fill: only when the prompt says the product group is unresolved AND the text clearly matches a configured code; return the CODE exactly; otherwise null.',
      },
      businessFit: {
        type: 'string',
        description:
          '1-2 sentences on fit for Kerchanshe Group businesses (coffee trading, beef, stationery/pens, plates, paints, vehicle & machinery import), or null when unclear.',
      },
    },
    required: ['summary'],
  },
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a tender analysis assistant for the Kerchanshe Group Marketing Intelligence System.

Your job is to read tender/opportunity descriptions and:
1. Generate a concise, factual 2-4 sentence summary.
2. Extract structured information (value, eligibility, documents, contacts, key dates).
3. Rate how each structured field was derived (fieldBasis).
4. Fill classification gaps ONLY where the prompt says the rules were inconclusive.

RULES:
- Only state facts that are present in the source text. Do NOT fabricate or infer information.
- If a field is not mentioned, return null for it — never guess.
- Be precise about monetary values and dates.
- fieldBasis per field: "confirmed" (explicitly stated), "inferred" (strongly implied), "uncertain" (weakly implied), "unavailable" (not present).
- suggestedOpportunityType: return null UNLESS the prompt says type rules were inconclusive AND the text clearly indicates RFQ, BUYER_LEAD, TRADE_INTELLIGENCE or MARKET_SIGNAL.
- suggestedProductGroup: return null UNLESS the prompt says the product group is unresolved AND the text clearly matches one of the configured codes; return the CODE exactly as listed, never invent a code.
- businessFit: 1-2 sentences about fit for Kerchanshe Group businesses (coffee trading, beef, stationery/pens, plates, paints, vehicle & machinery import) or null when unclear.
- Do not include any disclaimer or meta-commentary.
- Always call the extract_tender_info tool exactly once with your analysis.`;

// ---------------------------------------------------------------------------
// Result interface
// ---------------------------------------------------------------------------

export interface TenderEnrichmentResult {
  summary: string;
  structuredData: {
    estimatedValue: string | null;
    currency: string | null;
    eligibility: string | null;
    requiredDocuments: string | null;
    contactInfo: string | null;
    keyDates: string | null;
  };
  fieldBasis: Record<string, FieldBasis>;
  businessFit: string | null;
  suggestions: {
    opportunityType: OpportunityType | null;
    productGroup: string | null;
  };
  /** Which suggestions were actually persisted (see gap-fill policy). */
  applied: {
    typeApplied: boolean;
    productGroupApplied: boolean;
  };
}

export function parseFieldBasis(value: unknown): Record<string, FieldBasis> {
  const basis: Record<string, FieldBasis> = {};
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    for (const field of ['estimatedValue', 'currency', 'eligibility', 'requiredDocuments', 'contactInfo', 'keyDates']) {
      const v = record[field];
      if (typeof v === 'string' && (FIELD_BASIS_VALUES as readonly string[]).includes(v)) {
        basis[field] = v as FieldBasis;
      }
    }
  }
  return basis;
}

export function parseSuggestions(args: Record<string, unknown>): TenderEnrichmentResult['suggestions'] {
  return {
    opportunityType: isOpportunityType(args.suggestedOpportunityType) ? args.suggestedOpportunityType : null,
    productGroup: typeof args.suggestedProductGroup === 'string' && args.suggestedProductGroup.trim() !== ''
      ? args.suggestedProductGroup.trim().toUpperCase()
      : null,
  };
}

// ---------------------------------------------------------------------------
// Gap-fill policy (plan §8) — pure decision, unit-tested without LLM/DB.
//
// Type: applied only when keyword rules were inconclusive (method 'rule',
//       type not matched, row still defaulted to TENDER) and the model
//       suggests a different valid type.
// Product group: applied only when the row has none and the suggested CODE
//       matches the configured taxonomy (never invented codes).
// ---------------------------------------------------------------------------

export interface GapFillInput {
  method: string;
  typeMatched: boolean;
  currentType: string;
  currentProductGroupId: number | null;
  configuredGroups: Array<{ ProductGroupID: number; Code: string }>;
  suggestions: TenderEnrichmentResult['suggestions'];
}

export interface GapFillDecision {
  applyType: boolean;
  applyProductGroup: { ProductGroupID: number; Code: string } | null;
}

export function decideGapFill(input: GapFillInput): GapFillDecision {
  const rulesInconclusiveType =
    input.method === 'rule' && !input.typeMatched && input.currentType === 'TENDER';
  const applyType = Boolean(
    rulesInconclusiveType &&
      input.suggestions.opportunityType &&
      input.suggestions.opportunityType !== input.currentType,
  );

  let applyProductGroup: GapFillDecision['applyProductGroup'] = null;
  if (input.currentProductGroupId == null && input.suggestions.productGroup) {
    const suggested = input.suggestions.productGroup.toUpperCase();
    const target = input.configuredGroups.find((g) => g.Code.toUpperCase() === suggested);
    if (target) applyProductGroup = target;
  }

  return { applyType, applyProductGroup };
}

// ---------------------------------------------------------------------------
// Parse function — extracts the tool call or JSON from the provider response
// ---------------------------------------------------------------------------

function parseEnrichmentResult(result: ProviderChatResult): TenderEnrichmentResult {
  // Try tool call first.
  const call = result.toolCalls.find((c) => c.name === TENDER_TOOL.name) ?? result.toolCalls[0];
  if (call && typeof call.args === 'object' && call.args !== null) {
    const args = call.args as Record<string, unknown>;
    return {
      summary: String(args.summary ?? ''),
      structuredData: {
        estimatedValue: args.estimatedValue ? String(args.estimatedValue) : null,
        currency: args.currency ? String(args.currency) : null,
        eligibility: args.eligibility ? String(args.eligibility) : null,
        requiredDocuments: args.requiredDocuments ? String(args.requiredDocuments) : null,
        contactInfo: args.contactInfo ? String(args.contactInfo) : null,
        keyDates: args.keyDates ? String(args.keyDates) : null,
      },
      fieldBasis: parseFieldBasis(args.fieldBasis),
      businessFit: typeof args.businessFit === 'string' && args.businessFit.trim() !== '' ? args.businessFit.trim() : null,
      suggestions: parseSuggestions(args),
      applied: { typeApplied: false, productGroupApplied: false },
    };
  }

  // Fall back to text JSON.
  if (result.text) {
    const parsed = extractJson(result.text) as Record<string, unknown>;
    return {
      summary: String(parsed.summary ?? ''),
      structuredData: {
        estimatedValue: parsed.estimatedValue ? String(parsed.estimatedValue) : null,
        currency: parsed.currency ? String(parsed.currency) : null,
        eligibility: parsed.eligibility ? String(parsed.eligibility) : null,
        requiredDocuments: parsed.requiredDocuments ? String(parsed.requiredDocuments) : null,
        contactInfo: parsed.contactInfo ? String(parsed.contactInfo) : null,
        keyDates: parsed.keyDates ? String(parsed.keyDates) : null,
      },
      fieldBasis: parseFieldBasis(parsed.fieldBasis),
      businessFit: typeof parsed.businessFit === 'string' && parsed.businessFit.trim() !== '' ? parsed.businessFit.trim() : null,
      suggestions: parseSuggestions(parsed),
      applied: { typeApplied: false, productGroupApplied: false },
    };
  }

  throw new ProviderError('malformed-response', 'The AI model did not return a tool call or JSON for tender enrichment');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enriches a single tender opportunity with AI summary + structured extraction.
 * Stores the result in the database. Returns the enrichment result.
 */
export async function enrichOpportunity(
  opportunityId: number,
  providerChoice: ProviderChoice = 'auto',
): Promise<TenderEnrichmentResult> {
  // Load the opportunity.
  const result = await db
    .request()
    .input('Id', sql.Int, opportunityId)
    .query(
      `SELECT TenderOpportunityID, Title, Organization, Description, Country, Sector,
              EstimatedValue, Currency, DeadlineDate, SourceUrl, PublicationDate,
              OpportunityType, ClassificationMethod, ProductGroupId
       FROM dbo.TenderOpportunity
       WHERE TenderOpportunityID = @Id`
    );
  if (result.recordset.length === 0) {
    throw new Error('Tender opportunity not found');
  }

  const opp = result.recordset[0];

  // Rule classification state — drives the gap-fill policy (plan §8): the AI
  // may only suggest a type when the keyword rules were inconclusive and a
  // product group when none resolved.
  const groups = await loadProductGroupsSafe();
  const cls = classifyOpportunity(
    {
      title: (opp.Title as string) || '',
      description: (opp.Description as string) || null,
      sector: (opp.Sector as string) || null,
      organization: (opp.Organization as string) || null,
    },
    groups,
  );
  const method = (opp.ClassificationMethod as string) || 'rule';
  const rulesInconclusiveType =
    method === 'rule' && !cls.typeMatched && (opp.OpportunityType as string) === 'TENDER';
  const pgUnresolved = opp.ProductGroupId == null;

  // Build the prompt from available text.
  const promptParts: string[] = [
    `Title: ${opp.Title}`,
    opp.Organization ? `Organization: ${opp.Organization}` : '',
    opp.Country ? `Country: ${opp.Country}` : '',
    opp.Sector ? `Sector: ${opp.Sector}` : '',
    opp.Description ? `Description: ${opp.Description}` : '',
    opp.EstimatedValue ? `Estimated Value: ${opp.EstimatedValue} ${opp.Currency || ''}` : '',
    opp.DeadlineDate ? `Deadline: ${new Date(opp.DeadlineDate).toUTCString()}` : '',
    opp.PublicationDate ? `Published: ${new Date(opp.PublicationDate).toUTCString()}` : '',
    `Source URL: ${opp.SourceUrl}`,
    '',
    'Classification state:',
    `- Opportunity type: ${opp.OpportunityType} (keyword rules ${rulesInconclusiveType ? 'were inconclusive — type suggestions are allowed' : 'matched or the type is authoritative — return suggestedOpportunityType as null'})`,
    `- Product group: ${pgUnresolved ? '(none) — product group suggestions are allowed' : `${groups.find((g) => g.ProductGroupID === opp.ProductGroupId)?.Code ?? '(set)'} — return suggestedProductGroup as null`}`,
    `Configured product group codes (the ONLY valid values for suggestedProductGroup): ${groups.map((g) => g.Code).join(', ') || '(none configured)'}`,
  ].filter((part) => part !== '');

  const messages: ChatTurn[] = [
    {
      role: 'user',
      content: `Please analyze this tender/opportunity and provide a summary and structured extraction:\n\n${promptParts.join('\n')}`,
    },
  ];

  const orchestrateResult = await orchestrate<TenderEnrichmentResult>({
    provider: providerChoice,
    intent: 'analyze',
    messages,
    system: SYSTEM_PROMPT,
    tool: TENDER_TOOL,
    parse: parseEnrichmentResult,
    timeoutMs: env.ai.timeoutMs,
  });

  const enriched = orchestrateResult.response;

  // --- Gap-fill application (plan §8 policy, see decideGapFill) ------------
  const decision = decideGapFill({
    method,
    typeMatched: cls.typeMatched,
    currentType: String(opp.OpportunityType || 'TENDER'),
    currentProductGroupId: opp.ProductGroupId == null ? null : Number(opp.ProductGroupId),
    configuredGroups: groups,
    suggestions: enriched.suggestions,
  });

  enriched.applied.typeApplied = decision.applyType;
  if (decision.applyProductGroup) {
    enriched.applied.productGroupApplied = true;
    await db
      .request()
      .input('Id', sql.Int, opportunityId)
      .input('ProductGroupId', sql.Int, decision.applyProductGroup.ProductGroupID)
      .query(
        `UPDATE dbo.TenderOpportunity
         SET ProductGroupId = @ProductGroupId,
             ClassificationMethod = 'ai',
             ClassifiedAt = SYSUTCDATETIME(),
             UpdatedAt = SYSUTCDATETIME()
         WHERE TenderOpportunityID = @Id`
      );
  }
  if (enriched.applied.typeApplied) {
    await db
      .request()
      .input('Id', sql.Int, opportunityId)
      .input('OpportunityType', sql.VarChar(30), enriched.suggestions.opportunityType)
      .query(
        `UPDATE dbo.TenderOpportunity
         SET OpportunityType = @OpportunityType,
             ClassificationMethod = 'ai',
             ClassifiedAt = SYSUTCDATETIME(),
             UpdatedAt = SYSUTCDATETIME()
         WHERE TenderOpportunityID = @Id`
      );
  }
  if (enriched.applied.typeApplied || enriched.applied.productGroupApplied) {
    // Classification changed → relevance components (type / product group /
    // save-rate prior) may change too.
    try {
      await scoreOpportunity(opportunityId);
    } catch (err) {
      logger.warn('Post-enrichment rescore failed', {
        opportunityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const gapFill = {
    fieldBasis: enriched.fieldBasis,
    businessFit: enriched.businessFit,
    suggestions: enriched.suggestions,
    applied: enriched.applied,
  };

  // Persist the result.
  await db
    .request()
    .input('Id', sql.Int, opportunityId)
    .input('Summary', sql.NVarChar(sql.MAX), enriched.summary)
    .input('StructuredData', sql.NVarChar(sql.MAX), JSON.stringify(enriched.structuredData))
    .input('GapFill', sql.NVarChar(sql.MAX), JSON.stringify(gapFill))
    .query(
      `UPDATE dbo.TenderOpportunity
       SET AiSummary = @Summary,
           AiStructuredData = @StructuredData,
           AiGapFill = @GapFill,
           AiEnrichedAt = SYSUTCDATETIME(),
           UpdatedAt = SYSUTCDATETIME()
       WHERE TenderOpportunityID = @Id`
    );

  logger.info('Tender AI enrichment completed', {
    opportunityId,
    provider: orchestrateResult.provider,
    model: orchestrateResult.model,
    durationMs: orchestrateResult.durationMs,
    typeApplied: enriched.applied.typeApplied,
    productGroupApplied: enriched.applied.productGroupApplied,
  });

  return enriched;
}
