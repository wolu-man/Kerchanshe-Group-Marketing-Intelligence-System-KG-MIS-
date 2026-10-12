// =============================================================================
// AI Form Assistant — centralized system prompt + form context builder.
// Everything the model is told about the KG-MIS Form Builder lives here so the
// instructions stay consistent across providers and are easy to maintain.
// =============================================================================

import { FIELD_TYPES } from '../forms/formSchema';
import type { FormElement, FormSchemaEnvelope } from '../forms/formSchema';
import type { FormRef, Intent } from './ai.types';

export const TOOL_NAME = 'propose_form_changes';

// ---------------------------------------------------------------------------
// The single tool the model is allowed to call. Its JSON payload is identical
// for every provider, which keeps the three integrations interchangeable.
// ---------------------------------------------------------------------------
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const ACTION_TYPES = [
  'CREATE_FORM', 'CREATE_PAGE', 'RENAME_PAGE', 'DELETE_PAGE',
  'ADD_SECTION', 'UPDATE_SECTION', 'DELETE_SECTION',
  'ADD_FIELD', 'GENERATE_QUESTIONS', 'UPDATE_FIELD', 'DELETE_FIELD', 'MOVE_FIELD', 'DUPLICATE_FIELD',
  'SET_REQUIRED', 'SET_VALIDATION', 'ADD_CONDITION', 'REMOVE_CONDITION',
  'CREATE_CHILD_FORM', 'LINK_CHILD_FORM',
  'ANALYZE_FORM', 'IMPROVE_FORM',
] as const;

export const FORM_TOOL: ToolSpec = {
  name: TOOL_NAME,
  description:
    'Return your reply to the user together with the structured form actions that implement their request. ' +
    'Call this tool exactly once per turn. Never write code, SQL or HTML.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: {
        type: 'string',
        description: 'Short, friendly message shown to the user: what you did, did not do, or need clarified.',
      },
      actions: {
        type: 'array',
        maxItems: 60,
        description: 'Structured form actions. Use [] when you are only answering a question or asking for clarification.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...ACTION_TYPES] },
          },
          required: ['type'],
          additionalProperties: true,
        },
      },
    },
    required: ['reply', 'actions'],
  },
};

// ---------------------------------------------------------------------------
// Action catalogue (textual spec the model follows)
// ---------------------------------------------------------------------------
const ACTION_GUIDE = `AVAILABLE ACTIONS (JSON objects, one per change):
- CREATE_FORM { title?, description?, pages?: [{id,title}], elements: [element] } — rebuild the whole form (empty forms only).
- CREATE_PAGE { title } / RENAME_PAGE { pageId, title } / DELETE_PAGE { pageId }
- ADD_SECTION { label, description?, pageId?, afterKey?, fields?: [element] }
- UPDATE_SECTION { sectionKey, label?, description?, pageId? } / DELETE_SECTION { sectionKey }
- ADD_FIELD { field: { type, label, required?, pageId?, afterKey?, atIndex?, ...props } }
  (afterKey/atIndex place the field relative to an existing element on the same page)
- GENERATE_QUESTIONS { pageId?, afterKey?, questions: [{type,label,required?,...props}...] }
- UPDATE_FIELD { fieldKey, patch: { label?, required?, description?, options?, min?, max?, minLength?, maxLength?, regex?, minSelections?, maxSelections?, pageId?, type?, ... } }
- DELETE_FIELD { fieldKey } / MOVE_FIELD { fieldKey, beforeKey?|afterKey?|index?, pageId? } / DUPLICATE_FIELD { fieldKey, label? }
- SET_REQUIRED { fieldKeys: [key...], required: boolean }
- SET_VALIDATION { fieldKey, validation: { required?, min?, max?, minLength?, maxLength?, regex?, options?, minSelections?, maxSelections? } }
- ADD_CONDITION { fieldKey, kind: "displayWhen"|"conditional"|"branching", condition, jumpTo?, endForm? }
    condition = { fieldKey, operator, value? } or { operator: "and"|"or", rules: [...] }
    displayWhen = show only if true · conditional = becomes required if true · branching = skip/end form
- REMOVE_CONDITION { fieldKey, kind }
- CREATE_CHILD_FORM { title, description? } — creates a cloned child form (single level only).
- LINK_CHILD_FORM { templateId } — links an existing form as follow-up.
- ANALYZE_FORM { summary, issues?: [{severity:"info"|"warning"|"error",message,fieldKey?}], suggestions?: [...] }
    → report only; does not modify the form.
- IMPROVE_FORM { rationale, actions: [ <other actions> ] } — bundle several improvements under one explanation.

ELEMENT shape: { "type": <one of the field types below>, "label": <question text>, "required"?: bool, "options"?: string[], ... }

FIELD TYPES: ${FIELD_TYPES.join(', ')}

CONDITION OPERATORS: eq, neq, gt, lt, gte, lte, contains, in, empty, not-empty

RULES:
- Only use the field types, operators and properties listed here.
- Never invent field keys; reference keys exactly as given in the form context.
- A condition must reference a DIFFERENT field than the one it is attached to, and branching may only jump forward to a later field.
- Branding, styling, scoring, appearance settings and unrelated fields must be left untouched.
- Choice fields (dropdown, multiplechoice) need at least one option.
- A single answer must never mix questions with unrelated changes.`;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
export function buildSystemPrompt(): string {
  return `You are the AI Form Assistant for the KG-MIS (Kerchanshe Group Marketing Intelligence System) Form Builder — a form-design assistant for marketing surveys, customer feedback forms and market research questionnaires.

OUTPUT CONTRACT
- Call the tool "${TOOL_NAME}" exactly once with { reply, actions }.
- If tool calling is unavailable, output ONLY a JSON object with that same shape and nothing else (no markdown, no code fences, no commentary).
- "reply" is what the user sees. "actions" is the machine-executed change list.
- With no changes, return "actions": [].

HARD LIMITS
- You must NEVER output executable code (JavaScript, TypeScript, HTML, templates), shell commands or SQL. You cannot execute anything — you only propose structured actions.
- You must NEVER attempt to read, write or modify the database, files, users, permissions or anything outside the current form.
- You must NEVER use a field type, property or operator that is not listed below.
- You must preserve existing form functionality: do not remove, rename or reorder fields the user did not ask about, and do not touch branding, appearance, scoring or consent settings.

BEHAVIOUR
- Use the FORM CONTEXT below — it is the live state of the form being edited.
- Ask for clarification only when it is genuinely necessary; otherwise act.
- Keep the form well designed: clear question labels, logical order, no duplicated questions, sensible required flags.
- Destructive or structural changes must be minimal and precise; the user confirms them before they are applied.
- When the user asks for an analysis or improvements, answer with ANALYZE_FORM (report only) and/or concrete actions — never with prose-only change instructions.
- Reply in the same language the user wrote in.

${ACTION_GUIDE}`;
}

// ---------------------------------------------------------------------------
// Form context
// ---------------------------------------------------------------------------
function describeElement(el: FormElement, index: number): string {
  const parts: string[] = [`${index + 1}. [${el.type}] key=${el.key} label="${el.label}"`];
  if (el.required) parts.push('required');
  if (el.pageId) parts.push(`page=${el.pageId}`);
  if (el.options?.length) parts.push(`options=[${el.options.slice(0, 12).map((o) => `"${o}"`).join(', ')}]`);
  if (el.min !== undefined || el.max !== undefined) parts.push(`min=${el.min ?? '-'} max=${el.max ?? '-'}`);
  if (el.minLength !== undefined || el.maxLength !== undefined) parts.push(`len=${el.minLength ?? '-'}..${el.maxLength ?? '-'}`);
  if (el.regex) parts.push(`regex=${el.regex}`);
  if (el.minSelections !== undefined || el.maxSelections !== undefined) {
    parts.push(`selections=${el.minSelections ?? '-'}..${el.maxSelections ?? '-'}`);
  }
  if (el.matrixRows?.length) parts.push(`rows=[${el.matrixRows.join(', ')}]`);
  if (el.matrixColumns?.length) parts.push(`cols=[${el.matrixColumns.join(', ')}]`);
  if (el.pageId === undefined) parts.push('page=default');
  if (el.displayWhen) parts.push(`displayWhen=${JSON.stringify(el.displayWhen)}`);
  if (el.conditional) parts.push(`requiredWhen=${JSON.stringify(el.conditional)}`);
  if (el.branching) parts.push(`branching=${JSON.stringify(el.branching)}`);
  if (el.formula) parts.push(`formula=${el.formula}`);
  return parts.join(' ');
}

export interface ContextInput {
  form?: FormRef;
  schema: FormSchemaEnvelope;
  intent: Intent;
}

/** Serialises the live form state for the model — nothing else from the app. */
export function buildFormContext({ form, schema, intent }: ContextInput): string {
  const pages = schema.pages ?? [];
  const elements = schema.elements ?? [];
  const lines: string[] = [];

  lines.push('FORM CONTEXT');
  if (form?.id !== undefined) lines.push(`Form ID: ${form.id}`);
  lines.push(`Title: ${form?.title ?? 'Untitled form'}`);
  if (form?.description) lines.push(`Description: ${form.description}`);
  if (form?.status) lines.push(`Status: ${form.status}`);
  lines.push(`Requested operation: ${intent}`);
  lines.push(`Pages (${pages.length}): ${pages.map((p) => `${p.id} "${p.title}"`).join(' | ') || 'none'}`);
  lines.push(`Elements (${elements.length}), in canvas order:`);
  if (elements.length === 0) lines.push('  (the form is empty)');
  else elements.forEach((el, i) => lines.push(`  ${describeElement(el, i)}`));

  const branded = schema.branding
    ? `primary=${schema.branding.primaryColor ?? '-'} thankYou="${schema.branding.thankYou?.title ?? '-'}"`
    : 'none';
  lines.push(`Branding (do not modify): ${branded}`);

  return lines.join('\n');
}
