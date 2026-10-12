// =============================================================================
// AI Form Assistant — controlled tool/action layer (FDS EPIC-01 integration).
//
// The AI never touches the database and never emits code/SQL. It emits a list
// of structured actions which are:
//   1. parsed with Zod (unknown action types rejected, unknown properties
//      stripped so they can never reach the schema),
//   2. applied one-by-one to a deep clone of the CURRENT form schema,
//   3. re-validated with the existing formSchema.validateSchemaEnvelope()
//      after every single action — an action that would corrupt the form is
//      rejected and its changes discarded.
//
// The existing FormSchemaEnvelope remains the single source of truth; this
// module does not introduce a second schema.
// =============================================================================

import { z } from 'zod';
import {
  FIELD_TYPES,
  validateSchemaEnvelope,
  type FormBranding,
  type FormElement,
  type FormPage,
  type FormSchemaEnvelope,
} from '../forms/formSchema';
import type { PreviewLine, RejectedAction } from './ai.types';

export type SchemaEnvelope = FormSchemaEnvelope;
export type { FormBranding, FormElement, FormPage };

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
export const AI_LIMITS = {
  actions: 60,
  elements: 500,
  pages: 50,
  options: 100,
  questionsPerCall: 100,
} as const;

const FIELD_TYPE_LABELS: Record<string, string> = {
  shorttext: 'Short text', longtext: 'Paragraph', email: 'Email', phone: 'Phone',
  dropdown: 'Dropdown', multiplechoice: 'Multiple choice', yesno: 'Yes / No',
  rating: 'Rating', number: 'Number', slider: 'Slider', calculated: 'Calculated',
  date: 'Date', time: 'Time', datetime: 'Date & Time', file: 'File', image: 'Image upload',
  signature: 'Signature', location: 'Location', prefill: 'Prefill', matrix: 'Matrix',
  richtext: 'Rich text', heading: 'Heading', 'content-image': 'Image', divider: 'Divider',
  spacer: 'Spacer', button: 'Button', quote: 'Quote', section: 'Section',
  instructions: 'Instructions', container: 'Container',
};

const OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'in', 'empty', 'not-empty'] as const;

// ---------------------------------------------------------------------------
// Zod contracts
// ---------------------------------------------------------------------------
const fieldTypeSchema = z.enum(FIELD_TYPES);
const operatorSchema = z.enum(OPERATORS);
const textShort = z.string().min(1).max(300);
const keySchema = z.string().min(1).max(100);

/** Properties the assistant may set on an element (curated subset of FormElement). */
const patchShape = {
  label: textShort.optional(),
  description: z.string().max(2000).optional(),
  placeholder: z.string().max(300).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().min(1).max(300)).max(AI_LIMITS.options).optional(),
  min: z.number().min(-1e9).max(1e9).optional(),
  max: z.number().min(-1e9).max(1e9).optional(),
  minLength: z.number().int().min(0).max(100000).optional(),
  maxLength: z.number().int().min(1).max(100000).optional(),
  regex: z.string().max(500).optional(),
  minSelections: z.number().int().min(0).max(100).optional(),
  maxSelections: z.number().int().min(1).max(100).optional(),
  matrixRows: z.array(z.string().min(1).max(200)).max(50).optional(),
  matrixColumns: z.array(z.string().min(1).max(200)).max(20).optional(),
  headingLevel: z.number().int().min(1).max(6).optional(),
  isReadOnly: z.boolean().optional(),
  formula: z.string().max(1000).optional(),
  pageId: z.string().min(1).max(50).optional(),
};

const elementSpecShape = {
  ...patchShape,
  type: fieldTypeSchema,
  label: textShort,
};

/** Element spec used for creation (no placement hints). */
const elementSpecSchema = z.object(elementSpecShape);

/** Element spec used when inserting a single field at a specific place. */
const aiFieldSchema = z.object({
  ...elementSpecShape,
  afterKey: keySchema.optional(),
  atIndex: z.number().int().min(0).max(AI_LIMITS.elements).optional(),
});

const conditionalRuleSchema = z.object({
  fieldKey: keySchema,
  operator: operatorSchema,
  value: z
    .union([
      z.string().max(500),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.union([z.string().max(200), z.number()])).max(50),
    ])
    .optional(),
});

const conditionalGroupSchema = z.object({
  operator: z.enum(['and', 'or']),
  rules: z.array(conditionalRuleSchema).min(1).max(20),
});

const conditionSchema = z.union([conditionalRuleSchema, conditionalGroupSchema]);

const validationShape = {
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().min(0).max(100000).optional(),
  maxLength: z.number().int().min(1).max(100000).optional(),
  regex: z.string().max(500).optional(),
  options: z.array(z.string().min(1).max(300)).max(AI_LIMITS.options).optional(),
  minSelections: z.number().int().min(0).max(100).optional(),
  maxSelections: z.number().int().min(1).max(100).optional(),
};

const conditionKindSchema = z.enum(['displayWhen', 'conditional', 'branching']);

/**
 * Leaf actions — everything the assistant can do. IMPROVE_FORM wraps a list of
 * these (exactly one nesting level, enforced by construction).
 */
const leafActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CREATE_FORM'),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).optional(),
    pages: z
      .array(z.object({ id: z.string().min(1).max(50), title: z.string().min(1).max(200) }))
      .max(AI_LIMITS.pages)
      .optional(),
    elements: z.array(elementSpecSchema).max(AI_LIMITS.elements),
  }),
  z.object({ type: z.literal('CREATE_PAGE'), title: textShort }),
  z.object({ type: z.literal('RENAME_PAGE'), pageId: keySchema, title: textShort }),
  z.object({ type: z.literal('DELETE_PAGE'), pageId: keySchema }),
  z.object({
    type: z.literal('ADD_SECTION'),
    label: textShort,
    description: z.string().max(2000).optional(),
    pageId: z.string().min(1).max(50).optional(),
    afterKey: keySchema.optional(),
    fields: z.array(elementSpecSchema).max(AI_LIMITS.questionsPerCall).optional(),
  }),
  z.object({
    type: z.literal('UPDATE_SECTION'),
    sectionKey: keySchema,
    label: textShort.optional(),
    description: z.string().max(2000).optional(),
    pageId: z.string().min(1).max(50).optional(),
  }),
  z.object({ type: z.literal('DELETE_SECTION'), sectionKey: keySchema }),
  z.object({ type: z.literal('ADD_FIELD'), field: aiFieldSchema }),
  z.object({
    type: z.literal('GENERATE_QUESTIONS'),
    title: textShort.optional(),
    pageId: z.string().min(1).max(50).optional(),
    afterKey: keySchema.optional(),
    questions: z.array(elementSpecSchema).min(1).max(AI_LIMITS.questionsPerCall),
  }),
  z.object({
    type: z.literal('UPDATE_FIELD'),
    fieldKey: keySchema,
    patch: z.object({ ...patchShape, type: fieldTypeSchema.optional() }),
  }),
  z.object({ type: z.literal('DELETE_FIELD'), fieldKey: keySchema }),
  z.object({
    type: z.literal('MOVE_FIELD'),
    fieldKey: keySchema,
    beforeKey: keySchema.optional(),
    afterKey: keySchema.optional(),
    index: z.number().int().min(0).max(AI_LIMITS.elements).optional(),
    pageId: z.string().min(1).max(50).optional(),
  }),
  z.object({ type: z.literal('DUPLICATE_FIELD'), fieldKey: keySchema, label: textShort.optional() }),
  z.object({
    type: z.literal('SET_REQUIRED'),
    fieldKeys: z.array(keySchema).min(1).max(50),
    required: z.boolean(),
  }),
  z.object({ type: z.literal('SET_VALIDATION'), fieldKey: keySchema, validation: z.object(validationShape) }),
  z.object({
    type: z.literal('ADD_CONDITION'),
    fieldKey: keySchema,
    kind: conditionKindSchema,
    condition: conditionSchema,
    jumpTo: keySchema.optional(),
    endForm: z.boolean().optional(),
  }),
  z.object({ type: z.literal('REMOVE_CONDITION'), fieldKey: keySchema, kind: conditionKindSchema }),
  z.object({ type: z.literal('CREATE_CHILD_FORM'), title: textShort, description: z.string().max(4000).optional() }),
  z.object({ type: z.literal('LINK_CHILD_FORM'), templateId: z.number().int().positive() }),
  z.object({
    type: z.literal('ANALYZE_FORM'),
    summary: z.string().min(1).max(4000),
    issues: z
      .array(
        z.object({
          severity: z.enum(['info', 'warning', 'error']),
          message: z.string().min(1).max(500),
          fieldKey: keySchema.optional(),
        })
      )
      .max(50)
      .optional(),
    suggestions: z.array(z.string().min(1).max(500)).max(50).optional(),
  }),
]);

/** Full action contract (IMPROVE_FORM may nest exactly one level of leaves). */
export const formActionSchema = z.union([
  leafActionSchema,
  z.object({
    type: z.literal('IMPROVE_FORM'),
    rationale: z.string().min(1).max(2000),
    actions: z.array(leafActionSchema).min(1).max(AI_LIMITS.actions),
  }),
]);

export type FormAction = z.infer<typeof formActionSchema>;
export type LeafFormAction = z.infer<typeof leafActionSchema>;
export type ActionKind = LeafFormAction['type'] | 'IMPROVE_FORM';

const leafKinds = leafActionSchema.options.map(
  (opt) => ((opt as unknown as { shape: { type: { value: string } } }).shape.type.value as LeafFormAction['type'])
);

export const ACTION_KINDS: ActionKind[] = [...leafKinds, 'IMPROVE_FORM'];

const DB_ACTION_KINDS = new Set<string>(['CREATE_CHILD_FORM', 'LINK_CHILD_FORM']);
const DESTRUCTIVE_KINDS = new Set<string>([
  'DELETE_FIELD',
  'DELETE_SECTION',
  'DELETE_PAGE',
  'CREATE_FORM',
  'CREATE_CHILD_FORM',
  'LINK_CHILD_FORM',
]);

// ---------------------------------------------------------------------------
// Request payload schemas (used by ai.routes.ts)
// ---------------------------------------------------------------------------
export const schemaEnvelopeSchema = z.object({
  schemaVersion: z.number().int().min(1).max(10).optional(),
  pages: z
    .array(z.object({ id: z.string().min(1).max(50), title: z.string().min(1).max(200) }).passthrough())
    .max(AI_LIMITS.pages)
    .optional(),
  elements: z
    .array(
      z
        .object({
          key: z.string().min(1).max(100),
          type: z.string().min(1).max(50),
          label: z.string().max(300),
          order: z.number().int(),
        })
        .passthrough()
    )
    .max(AI_LIMITS.elements),
  branding: z.unknown().optional(),
});

/** What the model is allowed to answer with (tool arguments == JSON payload). */
export const modelResponseSchema = z.object({
  reply: z.string().max(6000).default(''),
  actions: z.array(formActionSchema).max(AI_LIMITS.actions).default([]),
});

export type ModelResponse = z.infer<typeof modelResponseSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function clone<T>(value: T): T {
  return structuredClone(value);
}

function slug(label: string, fallback = 'field'): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return base || fallback;
}

/** AI-created keys are prefixed so they can never collide with palette keys. */
function uniqueKey(draft: Draft, label: string, fallback = 'field'): string {
  const base = `ai_${slug(label, fallback)}`;
  let n = 1;
  let key = `${base}_${n}`;
  while (draft.elements.some((e) => e.key === key)) {
    n += 1;
    key = `${base}_${n}`;
  }
  return key;
}

interface Draft {
  pages: FormPage[];
  elements: FormElement[];
  branding?: FormBranding;
}

function findElement(draft: Draft, key: string): FormElement {
  const el = draft.elements.find((e) => e.key === key);
  if (!el) throw new ActionError(`Unknown field "${key}"`);
  return el;
}

function findPage(draft: Draft, id: string): FormPage {
  const page = draft.pages.find((p) => p.id === id);
  if (!page) throw new ActionError(`Unknown page "${id}"`);
  return page;
}

function firstPageId(draft: Draft): string {
  return draft.pages[0].id;
}

function targetPageId(draft: Draft, requested?: string): string {
  if (requested) {
    findPage(draft, requested);
    return requested;
  }
  return firstPageId(draft);
}

/** Position in the flat element array where a new element should be inserted. */
function resolveInsertIndex(draft: Draft, pageId: string, opts: { afterKey?: string; atIndex?: number }): number {
  if (opts.afterKey) {
    const anchor = findElement(draft, opts.afterKey);
    const anchorPage = anchor.pageId ?? firstPageId(draft);
    if (anchorPage !== pageId) {
      throw new ActionError(`afterKey "${opts.afterKey}" is not on page "${pageId}"`);
    }
    return draft.elements.indexOf(anchor) + 1;
  }
  if (opts.atIndex !== undefined) {
    const onPage = draft.elements.filter((e) => (e.pageId ?? firstPageId(draft)) === pageId);
    if (onPage.length === 0) return draft.elements.length;
    const clamped = Math.min(opts.atIndex, onPage.length);
    if (clamped >= onPage.length) return draft.elements.indexOf(onPage[onPage.length - 1]) + 1;
    return draft.elements.indexOf(onPage[clamped]);
  }
  for (let i = draft.elements.length - 1; i >= 0; i -= 1) {
    if ((draft.elements[i].pageId ?? firstPageId(draft)) === pageId) return i + 1;
  }
  return draft.elements.length;
}

function withTypeDefaults(
  spec: z.infer<typeof elementSpecSchema>,
  key: string,
  pageId: string
): FormElement {
  const el: FormElement = {
    key,
    type: spec.type,
    label: spec.label,
    required: spec.required ?? false,
    order: 0,
    pageId,
  };

  switch (spec.type) {
    case 'dropdown':
    case 'multiplechoice':
      if (!spec.options) el.options = ['Option 1', 'Option 2'];
      break;
    case 'number':
      if (spec.min === undefined) el.min = 0;
      break;
    case 'slider':
      if (spec.min === undefined) el.min = 0;
      if (spec.max === undefined) el.max = 100;
      break;
    case 'rating':
      if (spec.min === undefined) el.min = 1;
      if (spec.max === undefined) el.max = 5;
      break;
    case 'file':
    case 'image':
      el.fileMaxCount = 1;
      el.fileMaxSizeMB = 10;
      break;
    case 'signature':
      el.fileMaxCount = 1;
      el.fileMaxSizeMB = 10;
      el.penColor = '#000000';
      el.penWidth = 2;
      el.signatureHeight = 200;
      break;
    case 'matrix':
      if (!spec.matrixRows) el.matrixRows = ['Row 1', 'Row 2'];
      if (!spec.matrixColumns) el.matrixColumns = ['Col 1', 'Col 2'];
      el.matrixScale = 'single';
      break;
    case 'calculated':
      el.isReadOnly = true;
      break;
    case 'prefill':
      el.prefillSource = 'name';
      el.isReadOnly = true;
      break;
    case 'longtext':
      if (spec.maxLength === undefined) el.maxLength = 2000;
      break;
    case 'shorttext':
      if (spec.maxLength === undefined) el.maxLength = 255;
      break;
    case 'heading':
      if (spec.headingLevel === undefined) el.headingLevel = 2;
      break;
    case 'content-image':
      el.imageFit = 'cover';
      el.imageBorderRadius = 8;
      break;
    case 'divider':
      el.dividerStyle = 'solid';
      el.dividerColor = '#e0e0e0';
      break;
    case 'spacer':
      el.spacerHeight = 40;
      break;
    case 'button':
      el.buttonLabel = 'Click me';
      el.buttonVariant = 'primary';
      break;
    case 'quote':
      el.quoteContent = 'Quote text…';
      break;
    case 'richtext':
      el.contentHtml = '<p>Rich text content…</p>';
      break;
    case 'container':
      el.containerLayout = { columns: 1, gap: 12, padding: '16px' };
      break;
    default:
      break;
  }

  // Overlay explicitly provided properties (never `key`/`type`/`order`/`pageId`).
  for (const [prop, value] of Object.entries(spec)) {
    if (value === undefined) continue;
    if (prop === 'type' || prop === 'label' || prop === 'pageId') continue;
    if (prop === 'options' && (value as string[]).length === 0) {
      throw new ActionError(`Choice field "${spec.label}" needs at least one option`);
    }
    (el as unknown as Record<string, unknown>)[prop] = value;
  }

  if (spec.type === 'rating') el.scoring = { ...(el.scoring ?? {}), maxPoints: el.max ?? 5 };

  return el;
}

function validateDraft(draft: Draft): string[] {
  const ordered = draft.elements.map((e, i) => ({ ...e, order: i }));
  return validateSchemaEnvelope({ schemaVersion: 2, pages: draft.pages, elements: ordered, branding: draft.branding });
}

function reindex(draft: Draft): void {
  draft.elements = draft.elements.map((e, i) => ({ ...e, order: i }));
}

/** Removes conditions that point at a key that is about to disappear. */
function stripReferences(draft: Draft, removedKey: string, warnings: string[]): void {
  let touched = 0;

  const cleanRules = (ruleOrGroup: unknown): unknown => {
    const group = ruleOrGroup as { rules?: Array<{ fieldKey?: string }> } | undefined;
    if (group && Array.isArray(group.rules)) {
      const rules = group.rules.filter((r) => r?.fieldKey !== removedKey);
      touched += group.rules.length - rules.length;
      if (rules.length === 0) return undefined;
      return { ...group, rules };
    }
    const rule = ruleOrGroup as { fieldKey?: string } | undefined;
    if (rule && rule.fieldKey === removedKey) {
      touched += 1;
      return undefined;
    }
    return ruleOrGroup;
  };

  for (const el of draft.elements) {
    if (el.conditional) {
      const next = cleanRules(el.conditional);
      if (next === undefined) delete el.conditional;
      else el.conditional = next as FormElement['conditional'];
    }
    if (el.displayWhen) {
      const next = cleanRules(el.displayWhen);
      if (next === undefined) delete el.displayWhen;
      else el.displayWhen = next as FormElement['displayWhen'];
    }
    if (el.branching) {
      const nextCond = cleanRules(el.branching.condition);
      if (nextCond === undefined) {
        delete el.branching;
      } else if (el.branching.jumpTo === removedKey) {
        touched += 1;
        const rest: NonNullable<FormElement['branching']> = {
          condition: nextCond as never,
          ...(el.branching.endForm ? { endForm: true } : {}),
        };
        el.branching = rest;
      } else {
        el.branching = { ...el.branching, condition: nextCond as never };
      }
    }
  }

  if (touched > 0) warnings.push(`Removed ${touched} condition reference(s) to deleted field "${removedKey}"`);
}

// ---------------------------------------------------------------------------
// Action application (one action at a time, each independently validated)
// ---------------------------------------------------------------------------
function applyLeaf(draft: Draft, action: LeafFormAction, warnings: string[]): void {
  switch (action.type) {
    case 'CREATE_FORM': {
      const pages: FormPage[] =
        action.pages && action.pages.length > 0
          ? action.pages.map((p) => ({ id: p.id, title: p.title }))
          : [{ id: 'page-1', title: action.title ?? 'Page 1' }];
      draft.pages = pages;
      draft.elements = [];
      for (const spec of action.elements) {
        const pageId = spec.pageId && pages.some((p) => p.id === spec.pageId) ? spec.pageId : pages[0].id;
        const key = uniqueKey(draft, spec.label, spec.type);
        draft.elements.push(withTypeDefaults(spec, key, pageId));
      }
      return;
    }

    case 'CREATE_PAGE': {
      let id = `page-${draft.pages.length + 1}`;
      while (draft.pages.some((p) => p.id === id)) id = `${id}x`;
      draft.pages.push({ id, title: action.title });
      return;
    }

    case 'RENAME_PAGE': {
      findPage(draft, action.pageId).title = action.title;
      return;
    }

    case 'DELETE_PAGE': {
      if (draft.pages.length <= 1) throw new ActionError('A form must keep at least one page');
      findPage(draft, action.pageId);
      const fallback = draft.pages.find((p) => p.id !== action.pageId)!;
      for (const el of draft.elements) {
        if ((el.pageId ?? firstPageId(draft)) === action.pageId) el.pageId = fallback.id;
      }
      draft.pages = draft.pages.filter((p) => p.id !== action.pageId);
      return;
    }

    case 'ADD_SECTION': {
      const pageId = targetPageId(draft, action.pageId);
      const index = resolveInsertIndex(draft, pageId, { afterKey: action.afterKey });
      const section: FormElement = {
        key: uniqueKey(draft, action.label, 'section'),
        type: 'section',
        label: action.label,
        required: false,
        order: 0,
        pageId,
      };
      if (action.description) section.description = action.description;
      draft.elements.splice(index, 0, section);

      let cursor = index + 1;
      for (const spec of action.fields ?? []) {
        const fieldPage = spec.pageId && draft.pages.some((p) => p.id === spec.pageId) ? spec.pageId : pageId;
        const key = uniqueKey(draft, spec.label, spec.type);
        draft.elements.splice(cursor, 0, withTypeDefaults(spec, key, fieldPage));
        cursor += 1;
      }
      return;
    }

    case 'UPDATE_SECTION': {
      const section = findElement(draft, action.sectionKey);
      if (section.type !== 'section') throw new ActionError(`"${action.sectionKey}" is not a section`);
      if (action.label !== undefined) section.label = action.label;
      if (action.description !== undefined) section.description = action.description;
      if (action.pageId !== undefined) {
        findPage(draft, action.pageId);
        section.pageId = action.pageId;
      }
      return;
    }

    case 'DELETE_SECTION': {
      const section = findElement(draft, action.sectionKey);
      if (section.type !== 'section') throw new ActionError(`"${action.sectionKey}" is not a section`);
      draft.elements = draft.elements.filter((e) => e.key !== action.sectionKey);
      stripReferences(draft, action.sectionKey, warnings);
      return;
    }

    case 'ADD_FIELD': {
      const { afterKey, atIndex, pageId: requestedPage, ...rest } = action.field;
      const pageId = targetPageId(draft, requestedPage);
      const index = resolveInsertIndex(draft, pageId, { afterKey, atIndex });
      const key = uniqueKey(draft, rest.label, rest.type);
      draft.elements.splice(index, 0, withTypeDefaults(rest, key, pageId));
      return;
    }

    case 'GENERATE_QUESTIONS': {
      const pageId = targetPageId(draft, action.pageId);
      const index = resolveInsertIndex(draft, pageId, { afterKey: action.afterKey });
      const created: FormElement[] = [];
      for (const spec of action.questions) {
        const fieldPage = spec.pageId && draft.pages.some((p) => p.id === spec.pageId) ? spec.pageId : pageId;
        const key = uniqueKey(draft, spec.label, spec.type);
        created.push(withTypeDefaults(spec, key, fieldPage));
      }
      draft.elements.splice(index, 0, ...created);
      return;
    }

    case 'UPDATE_FIELD': {
      const el = findElement(draft, action.fieldKey);
      const patch = { ...action.patch };

      if (patch.type !== undefined) {
        if (!FIELD_TYPES.includes(patch.type)) throw new ActionError(`Unknown field type "${String(patch.type)}"`);
        el.type = patch.type;
        if (patch.type !== 'calculated') delete el.formula;
        if (patch.type === 'dropdown' || patch.type === 'multiplechoice') {
          if (patch.options === undefined && (!el.options || el.options.length === 0)) {
            el.options = ['Option 1', 'Option 2'];
          }
        }
      }

      if (patch.options !== undefined) {
        if (patch.options.length === 0) throw new ActionError('Choice fields need at least one option');
        el.options = patch.options;
        if (el.scoring?.optionPoints) {
          const valid = new Set(patch.options);
          const kept = Object.fromEntries(Object.entries(el.scoring.optionPoints).filter(([k]) => valid.has(k)));
          el.scoring = { ...el.scoring, optionPoints: kept };
        }
      }

      if (patch.regex !== undefined) {
        if (patch.regex === '') delete el.regex;
        else {
          try {
            new RegExp(patch.regex);
          } catch {
            throw new ActionError(`"${patch.regex}" is not a valid regular expression`);
          }
        }
      }

      for (const [prop, value] of Object.entries(patch)) {
        if (prop === 'type' || prop === 'options' || prop === 'regex') continue;
        if (value === undefined) continue;
        if (prop === 'pageId') findPage(draft, String(value));
        (el as unknown as Record<string, unknown>)[prop] = value;
      }

      if (el.min !== undefined && el.max !== undefined && el.min > el.max) {
        throw new ActionError('min cannot be greater than max');
      }
      if (el.minLength !== undefined && el.maxLength !== undefined && el.minLength > el.maxLength) {
        throw new ActionError('minLength cannot be greater than maxLength');
      }

      if (el.type === 'rating') el.scoring = { ...(el.scoring ?? {}), maxPoints: el.max ?? 5 };
      return;
    }

    case 'DELETE_FIELD': {
      findElement(draft, action.fieldKey);
      draft.elements = draft.elements.filter((e) => e.key !== action.fieldKey);
      stripReferences(draft, action.fieldKey, warnings);
      return;
    }

    case 'MOVE_FIELD': {
      const el = findElement(draft, action.fieldKey);
      draft.elements.splice(draft.elements.indexOf(el), 1);

      let pageId = el.pageId ?? firstPageId(draft);
      if (action.pageId !== undefined) {
        findPage(draft, action.pageId);
        pageId = action.pageId;
        el.pageId = action.pageId;
      }

      if (action.beforeKey) {
        const anchor = findElement(draft, action.beforeKey);
        const anchorPage = anchor.pageId ?? firstPageId(draft);
        if (anchorPage !== pageId) {
          throw new ActionError(`beforeKey "${action.beforeKey}" is not on page "${pageId}"`);
        }
        draft.elements.splice(draft.elements.indexOf(anchor), 0, el);
        return;
      }

      const index = resolveInsertIndex(draft, pageId, { afterKey: action.afterKey, atIndex: action.index });
      draft.elements.splice(index, 0, el);
      return;
    }

    case 'DUPLICATE_FIELD': {
      const el = findElement(draft, action.fieldKey);
      const copy = clone(el);
      copy.key = uniqueKey(draft, action.label ?? el.label, el.type);
      if (action.label) copy.label = action.label;
      draft.elements.splice(draft.elements.indexOf(el) + 1, 0, copy);
      return;
    }

    case 'SET_REQUIRED': {
      const missing = action.fieldKeys.filter((k) => !draft.elements.some((e) => e.key === k));
      if (missing.length > 0) throw new ActionError(`Unknown field(s): ${missing.join(', ')}`);
      for (const key of action.fieldKeys) {
        const el = draft.elements.find((e) => e.key === key)!;
        if (['section', 'heading', 'divider', 'spacer', 'button', 'quote', 'container', 'instructions'].includes(el.type)) {
          throw new ActionError(`"${el.label}" is a design element and cannot be required`);
        }
        el.required = action.required;
      }
      return;
    }

    case 'SET_VALIDATION': {
      const el = findElement(draft, action.fieldKey);
      const v = action.validation;
      if (v.regex !== undefined && v.regex !== '') {
        try {
          new RegExp(v.regex);
        } catch {
          throw new ActionError(`"${v.regex}" is not a valid regular expression`);
        }
      }
      if (v.options !== undefined) {
        if (v.options.length === 0) throw new ActionError('Choice fields need at least one option');
        if (!['dropdown', 'multiplechoice', 'matrix'].includes(el.type)) {
          throw new ActionError(`"${el.label}" (${el.type}) does not support options`);
        }
      }
      if (v.min !== undefined && v.max !== undefined && v.min > v.max) {
        throw new ActionError('min cannot be greater than max');
      }
      const minLength = v.minLength ?? el.minLength;
      const maxLength = v.maxLength ?? el.maxLength;
      if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
        throw new ActionError('minLength cannot be greater than maxLength');
      }
      for (const [prop, value] of Object.entries(v)) {
        if (value === undefined) continue;
        if (prop === 'regex' && value === '') {
          delete el.regex;
          continue;
        }
        (el as unknown as Record<string, unknown>)[prop] = value;
      }
      if (el.type === 'rating') el.scoring = { ...(el.scoring ?? {}), maxPoints: el.max ?? 5 };
      return;
    }

    case 'ADD_CONDITION': {
      const el = findElement(draft, action.fieldKey);
      const condition = clone(action.condition);
      const rules = 'rules' in condition ? condition.rules : [condition];
      for (const rule of rules) {
        if (rule.fieldKey === action.fieldKey) {
          throw new ActionError(`"${action.fieldKey}" cannot reference itself in a condition`);
        }
        if (!draft.elements.some((e) => e.key === rule.fieldKey)) {
          throw new ActionError(`Condition references unknown field "${rule.fieldKey}"`);
        }
      }
      if (action.kind === 'branching') {
        const branching: NonNullable<FormElement['branching']> = { condition: condition as never };
        if (action.endForm) branching.endForm = true;
        if (action.jumpTo) {
          if (!draft.elements.some((e) => e.key === action.jumpTo)) {
            throw new ActionError(`Branch target "${action.jumpTo}" does not exist`);
          }
          branching.jumpTo = action.jumpTo;
        }
        el.branching = branching;
        return;
      }
      if (action.kind === 'displayWhen') el.displayWhen = condition as never;
      else el.conditional = condition as never;
      return;
    }

    case 'REMOVE_CONDITION': {
      const el = findElement(draft, action.fieldKey);
      if (action.kind === 'displayWhen') delete el.displayWhen;
      else if (action.kind === 'conditional') delete el.conditional;
      else delete el.branching;
      return;
    }

    case 'ANALYZE_FORM':
      return;

    case 'CREATE_CHILD_FORM':
    case 'LINK_CHILD_FORM':
      // Database-level: handled outside the schema (see applyFormActions).
      return;

    default: {
      const exhaustive: never = action;
      throw new ActionError(`Unsupported action ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export interface ApplyResult {
  schema: SchemaEnvelope;
  applied: LeafFormAction[];
  dbActions: LeafFormAction[];
  rejected: RejectedAction[];
  warnings: string[];
}

export function flattenActions(actions: FormAction[]): LeafFormAction[] {
  const out: LeafFormAction[] = [];
  for (const action of actions) {
    if (action.type === 'IMPROVE_FORM') out.push(...action.actions);
    else out.push(action);
  }
  return out;
}

/**
 * Applies assistant actions to a clone of the current schema.
 * Every action is validated on its own: if applying it would produce an
 * invalid form, the action is rejected and its changes are discarded.
 */
export function applyFormActions(input: SchemaEnvelope, actions: FormAction[]): ApplyResult {
  const draft: Draft = {
    pages: input.pages && input.pages.length > 0 ? clone(input.pages) : [{ id: 'page-1', title: 'Page 1' }],
    elements: clone(input.elements ?? []),
    branding: clone(input.branding),
  };

  const applied: LeafFormAction[] = [];
  const dbActions: LeafFormAction[] = [];
  const rejected: RejectedAction[] = [];
  const warnings: string[] = [];
  const flattened = flattenActions(actions);

  flattened.forEach((action, index) => {
    if (DB_ACTION_KINDS.has(action.type)) {
      dbActions.push(action);
      applied.push(action);
      return;
    }

    const next = clone(draft);
    const warningMark = warnings.length;
    try {
      applyLeaf(next, action, warnings);
      reindex(next);
      const errors = validateDraft(next);
      if (errors.length > 0) throw new ActionError(errors[0]);
      draft.pages = next.pages;
      draft.elements = next.elements;
      draft.branding = next.branding;
      applied.push(action);
    } catch (err) {
      warnings.length = warningMark; // roll back warnings from the rejected action
      const reason = err instanceof ActionError ? err.message : 'Action could not be applied';
      rejected.push({ index, type: action.type, reason });
    }
  });

  const schema: SchemaEnvelope = {
    schemaVersion: input.schemaVersion ?? 2,
    pages: draft.pages,
    elements: draft.elements,
    branding: draft.branding,
  };

  return { schema, applied, dbActions, rejected, warnings };
}

// ---------------------------------------------------------------------------
// Preview lines (human-readable "Proposed Changes")
// ---------------------------------------------------------------------------
function typeLabel(type: string): string {
  return FIELD_TYPE_LABELS[type] ?? type;
}

function describeCondition(condition: unknown): string {
  const group = condition as { operator?: string; rules?: Array<{ fieldKey: string; operator: string; value?: unknown }> };
  if (group && Array.isArray(group.rules)) {
    const parts = group.rules.map((r) => `${r.fieldKey} ${r.operator}${r.value !== undefined ? ` ${String(r.value)}` : ''}`);
    return parts.join(group.operator === 'or' ? ' OR ' : ' AND ');
  }
  const rule = condition as { fieldKey: string; operator: string; value?: unknown };
  return `${rule.fieldKey} ${rule.operator}${rule.value !== undefined ? ` ${String(rule.value)}` : ''}`;
}

function makeLookup(before: SchemaEnvelope, after: SchemaEnvelope): (key: string) => string {
  return (key: string) =>
    after.elements.find((e) => e.key === key)?.label ??
    before.elements.find((e) => e.key === key)?.label ??
    key;
}

export function buildPreview(
  before: SchemaEnvelope,
  after: SchemaEnvelope,
  actions: FormAction[],
  rejected: RejectedAction[]
): PreviewLine[] {
  const lines: PreviewLine[] = [];
  const flat = flattenActions(actions);
  const rejectedSet = new Set(rejected.map((r) => r.index));
  const label = makeLookup(before, after);

  // Container actions first, then their flattened children below.
  for (const top of actions) {
    if (top.type === 'IMPROVE_FORM') lines.push({ kind: 'info', text: `Improvement: ${top.rationale}` });
  }

  flat.forEach((action, i) => {
    if (rejectedSet.has(i)) return;
    switch (action.type) {
      case 'CREATE_FORM':
        lines.push({ kind: 'update', text: `Create form with ${action.elements.length} field(s)${action.title ? ` — "${action.title}"` : ''}` });
        break;
      case 'CREATE_PAGE':
        lines.push({ kind: 'add', text: `Create page "${action.title}"` });
        break;
      case 'RENAME_PAGE':
        lines.push({ kind: 'update', text: `Rename page "${action.pageId}" to "${action.title}"` });
        break;
      case 'DELETE_PAGE':
        lines.push({ kind: 'delete', text: `Delete page "${action.pageId}" (its fields move to the first page)` });
        break;
      case 'ADD_SECTION':
        lines.push({ kind: 'add', text: `Create section "${action.label}"` });
        for (const f of action.fields ?? []) {
          lines.push({ kind: 'add', text: `Add ${typeLabel(f.type)} "${f.label}"` });
        }
        break;
      case 'UPDATE_SECTION':
        lines.push({ kind: 'update', text: `Update section "${label(action.sectionKey)}"` });
        break;
      case 'DELETE_SECTION':
        lines.push({ kind: 'delete', text: `Delete section "${label(action.sectionKey)}"` });
        break;
      case 'ADD_FIELD':
        lines.push({
          kind: 'add',
          text: `Add ${typeLabel(action.field.type)} "${action.field.label}"${action.field.required ? ' (required)' : ''}`,
        });
        break;
      case 'GENERATE_QUESTIONS':
        action.questions.forEach((q, qi) => {
          if (qi >= 25) return;
          lines.push({ kind: 'add', text: `Add question ${qi + 1}: "${q.label}" (${typeLabel(q.type)})` });
        });
        if (action.questions.length > 25) {
          lines.push({ kind: 'info', text: `…and ${action.questions.length - 25} more question(s)` });
        }
        break;
      case 'UPDATE_FIELD':
        lines.push({
          kind: 'update',
          text: `Update "${label(action.fieldKey)}" (${Object.keys(action.patch).join(', ')})`,
        });
        break;
      case 'DELETE_FIELD':
        lines.push({
          kind: 'delete',
          text: `Delete ${typeLabel(before.elements.find((e) => e.key === action.fieldKey)?.type ?? 'field')} "${label(action.fieldKey)}"`,
        });
        break;
      case 'MOVE_FIELD':
        lines.push({
          kind: 'move',
          text: `Move "${label(action.fieldKey)}"${
            action.beforeKey
              ? ` before "${label(action.beforeKey)}"`
              : action.afterKey
                ? ` after "${label(action.afterKey)}"`
                : action.index !== undefined
                  ? ` to position ${action.index}`
                  : ''
          }`,
        });
        break;
      case 'DUPLICATE_FIELD':
        lines.push({ kind: 'add', text: `Duplicate "${label(action.fieldKey)}"` });
        break;
      case 'SET_REQUIRED':
        lines.push({
          kind: 'update',
          text: `Set ${action.fieldKeys.length} field(s) to ${action.required ? 'required' : 'optional'}: ${action.fieldKeys.map((k) => `"${label(k)}"`).join(', ')}`,
        });
        break;
      case 'SET_VALIDATION':
        lines.push({
          kind: 'update',
          text: `Update validation for "${label(action.fieldKey)}": ${Object.keys(action.validation).join(', ')}`,
        });
        break;
      case 'ADD_CONDITION': {
        const what = describeCondition(action.condition);
        if (action.kind === 'displayWhen') {
          lines.push({ kind: 'logic', text: `Show "${label(action.fieldKey)}" only when ${what}` });
        } else if (action.kind === 'conditional') {
          lines.push({ kind: 'logic', text: `Make "${label(action.fieldKey)}" required when ${what}` });
        } else {
          lines.push({
            kind: 'logic',
            text: `Branch "${label(action.fieldKey)}"${action.endForm ? ' to end the form' : action.jumpTo ? ` to "${label(action.jumpTo)}"` : ''} when ${what}`,
          });
        }
        break;
      }
      case 'REMOVE_CONDITION':
        lines.push({ kind: 'logic', text: `Remove ${action.kind} logic from "${label(action.fieldKey)}"` });
        break;
      case 'CREATE_CHILD_FORM':
        lines.push({ kind: 'db', text: `Create child form "${action.title}"` });
        break;
      case 'LINK_CHILD_FORM':
        lines.push({ kind: 'db', text: `Link follow-up form #${action.templateId}` });
        break;
      case 'ANALYZE_FORM':
        lines.push({ kind: 'info', text: `Analysis: ${action.summary}` });
        for (const issue of (action.issues ?? []).slice(0, 20)) {
          lines.push({ kind: 'info', text: `${issue.severity === 'error' ? '✕' : issue.severity === 'warning' ? '⚠' : '•'} ${issue.message}` });
        }
        for (const s of (action.suggestions ?? []).slice(0, 20)) {
          lines.push({ kind: 'info', text: `→ ${s}` });
        }
        break;
      default:
        break;
    }
  });

  for (const r of rejected) {
    lines.push({ kind: 'delete', text: `✕ Rejected ${r.type}: ${r.reason}` });
  }

  return lines;
}

/** Structural / destructive / multi-step changes always require confirmation. */
export function requiresConfirmation(actions: FormAction[], rejected: RejectedAction[], warnings: string[]): boolean {
  if (rejected.length > 0 || warnings.length > 0) return true;
  const flat = flattenActions(actions);
  if (flat.length > 1) return true;
  return flat.some((action) => DESTRUCTIVE_KINDS.has(action.type));
}

export function isDbAction(kind: string): boolean {
  return DB_ACTION_KINDS.has(kind);
}
