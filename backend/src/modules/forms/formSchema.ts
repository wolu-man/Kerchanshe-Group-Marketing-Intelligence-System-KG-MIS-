// =============================================================================
// NexForm runtime schema engine (FDS EPIC-01, NexForm SRS).
// A form's structure is a versioned JSON envelope (FormVersion.SchemaJSON):
//   { schemaVersion, pages, elements, branding }.
// Legacy bare-array schemas are auto-detected and normalized by parseSchema().
// This module defines the element contract and the server-side validation /
// branching / calculated-field / scoring engine (re-validated on submit).
// =============================================================================

export const FIELD_TYPES = [
  'shorttext', 'longtext', 'number', 'email', 'phone', 'date', 'time',
  'datetime', 'dropdown', 'multiplechoice', 'rating', 'yesno', 'file',
  'image', 'signature', 'slider', 'location', 'matrix', 'richtext',
  'calculated', 'prefill', 'section', 'instructions',
  'heading', 'content-image', 'divider', 'spacer', 'button', 'quote', 'container',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type Operator =
  | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte'
  | 'contains' | 'in' | 'empty' | 'not-empty';

export interface ConditionalRule {
  fieldKey: string;
  operator: Operator;
  value?: unknown;
}

/** AND/OR group of rules (FV-02). A single ConditionalRule is accepted
 *  anywhere a group is expected and normalized via normalizeGroup(). */
export interface ConditionalGroup {
  operator: 'and' | 'or';
  rules: ConditionalRule[];
}

export interface BranchingRule {
  condition: ConditionalRule | ConditionalGroup;
  /** jump forward to this field key (inclusive). Omit for simple conditionals. */
  jumpTo?: string;
  /** end the form when the condition matches. */
  endForm?: boolean;
}

/** Points configuration (DR-12). optionPoints maps an answer/option to points;
 *  numeric fields use the raw value when no map is present. */
export interface ScoringConfig {
  /** explicit per-option points for choice/matrix fields */
  optionPoints?: Record<string, number>;
  /** override the maximum attainable for this field */
  maxPoints?: number;
}

export interface FormElement {
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  regex?: string;
  minSelections?: number;
  maxSelections?: number;
  fileAllowedTypes?: string[];
  fileMaxSizeMB?: number;
  fileMaxCount?: number;
  /** IF <condition> THEN this field becomes required (FR-01.9). */
  conditional?: ConditionalRule | ConditionalGroup;
  /** Display condition (FV-01/FV-02): field hidden unless it matches. */
  displayWhen?: ConditionalRule | ConditionalGroup;
  /** Skip logic (FR-01.10): jump past fields or end the form. */
  branching?: BranchingRule;
  /** Assigned page (must reference a page id in the envelope). */
  pageId?: string;
  /** Points configuration (DR-12). */
  scoring?: ScoringConfig;
  /** Calculated field formula (safe expression language, no eval). */
  formula?: string;
  /** Pre-filled read-only field source. */
  prefillSource?: 'name' | 'email' | 'static';
  prefillValue?: string;
  /** Matrix / grid rows + columns. */
  matrixRows?: string[];
  matrixColumns?: string[];
  matrixScale?: 'single' | 'multi';
  /** Location radius restriction in km (optional). */
  radiusKm?: number;
  isReadOnly?: boolean;
  order: number;
  /** Per-field visual styling overrides (optional, passthrough). */
  style?: Record<string, unknown>;
  /** Column layout configuration (optional, passthrough). */
  layout?: Record<string, unknown>;
  /** Presentation/content properties for design elements. Mirrors the Form
   *  Builder palette; stored as-is in SchemaJSON (optional passthrough). */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  contentHtml?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
  imageWidth?: string;
  imageFit?: 'cover' | 'contain' | 'fill' | 'none';
  imageBorderRadius?: number;
  dividerColor?: string;
  dividerStyle?: 'solid' | 'dashed' | 'dotted';
  spacerHeight?: number;
  buttonLabel?: string;
  buttonUrl?: string;
  buttonVariant?: 'primary' | 'secondary' | 'ghost';
  quoteContent?: string;
  quoteAuthor?: string;
  penColor?: string;
  penWidth?: number;
  signatureHeight?: number;
  containerLayout?: {
    columns?: 1 | 2 | 3;
    gap?: number;
    background?: string;
    border?: string;
    borderColor?: string;
    borderRadius?: string;
    padding?: string;
  };
}

export interface FormPage {
  id: string;
  title: string;
}

export interface FormBranding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  thankYou?: {
    title?: string;
    message?: string;
    showResponseId?: boolean;
    redirectUrl?: string;
  };
  /** Global form theme overrides (optional, passthrough). */
  theme?: Record<string, unknown>;
  /** Respondent-facing appearance customization */
  appearanceConfig?: AppearanceConfig;
}

export interface AppearanceConfig {
  header?: {
    enabled: boolean;
    imageUrl?: string;
    height: 'small' | 'medium' | 'large';
    fit: 'cover' | 'contain';
    position: 'left' | 'center' | 'right';
  };
  watermark?: {
    enabled: boolean;
    type: 'image' | 'text';
    imageUrl?: string;
    text?: string;
    position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'repeat';
    opacity: number;
    size: number;
    rotation: number;
  };
  bodyBackground?: {
    type: 'default' | 'solid' | 'gradient';
    color?: string;
    gradientStart?: string;
    gradientEnd?: string;
    gradientDirection: number;
  };
  footer?: {
    enabled: boolean;
    text?: string;
    logoUrl?: string;
    backgroundColor?: string;
    textColor?: string;
    textAlign: 'left' | 'center' | 'right';
    copyrightText?: string;
    showPoweredBy: boolean;
  };
}

export interface FormSchemaEnvelope {
  schemaVersion: number;
  pages: FormPage[];
  elements: FormElement[];
  branding?: FormBranding;
}

export interface FieldState {
  visible: boolean;
  required: boolean;
}

export type AnswerValue = unknown;

export type Answers = Record<string, AnswerValue>;

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0);
}

function normalize(a: unknown, b: unknown): [string, string] {
  return [String(a ?? '').trim().toLowerCase(), String(b ?? '').trim().toLowerCase()];
}

export function evaluateCondition(rule: ConditionalRule, answers: Answers): boolean {
  const actual = answers[rule.fieldKey];
  switch (rule.operator) {
    case 'empty': return isEmpty(actual);
    case 'not-empty': return !isEmpty(actual);
    case 'eq': {
      const [a, b] = normalize(actual, rule.value);
      return a === b;
    }
    case 'neq': {
      const [a, b] = normalize(actual, rule.value);
      return a !== b;
    }
    case 'gt': case 'lt': case 'gte': case 'lte': {
      const num = Number(actual);
      const target = Number(rule.value);
      if (!Number.isFinite(num) || !Number.isFinite(target)) return false;
      if (rule.operator === 'gt') return num > target;
      if (rule.operator === 'lt') return num < target;
      if (rule.operator === 'gte') return num >= target;
      return num <= target;
    }
    case 'contains': {
      if (Array.isArray(actual)) return actual.some((v) => String(v).toLowerCase().includes(String(rule.value ?? '').toLowerCase()));
      return String(actual ?? '').toLowerCase().includes(String(rule.value ?? '').toLowerCase());
    }
    case 'in': {
      if (!Array.isArray(rule.value)) return false;
      return rule.value.some((v) => normalize(actual, v)[0] === normalize(v, v)[0]);
    }
    default:
      return false;
  }
}

/** Normalizes a rule or a group into a group (backward compat). */
export function normalizeGroup(cond?: ConditionalRule | ConditionalGroup): ConditionalGroup | undefined {
  if (!cond) return undefined;
  if ('rules' in cond && Array.isArray((cond as ConditionalGroup).rules)) {
    return cond as ConditionalGroup;
  }
  return { operator: 'and', rules: [cond as ConditionalRule] };
}

export function evaluateGroup(cond: ConditionalRule | ConditionalGroup | undefined, answers: Answers): boolean {
  const group = normalizeGroup(cond);
  if (!group || group.rules.length === 0) return true;
  const results = group.rules.map((r) => evaluateCondition(r, answers));
  return group.operator === 'or' ? results.some(Boolean) : results.every(Boolean);
}

// ---------------------------------------------------------------------------
// Field visibility & required-state computation (display + branching in order)
// ---------------------------------------------------------------------------
export function computeFieldStates(elements: FormElement[], answers: Answers): Record<string, FieldState> {
  const states: Record<string, FieldState> = {};
  let skipUntilKey: string | null = null;
  let endForm = false;

  for (const el of elements) {
    if (endForm) {
      states[el.key] = { visible: false, required: false };
      continue;
    }
    if (skipUntilKey) {
      if (el.key === skipUntilKey) {
        skipUntilKey = null;
      } else {
        states[el.key] = { visible: false, required: false };
        continue;
      }
    }

    // Display condition (FV-01/02): hidden fields are excluded entirely.
    if (el.displayWhen && !evaluateGroup(el.displayWhen, answers)) {
      states[el.key] = { visible: false, required: false };
      continue;
    }

    const required = Boolean(el.required) ||
      (el.conditional ? evaluateGroup(el.conditional, answers) : false);
    states[el.key] = { visible: true, required };

    if (el.branching && el.type !== 'section' && evaluateGroup(el.branching.condition, answers)) {
      if (el.branching.endForm) endForm = true;
      else if (el.branching.jumpTo) skipUntilKey = el.branching.jumpTo;
    }
  }
  return states;
}

// ---------------------------------------------------------------------------
// Safe expression evaluator for calculated fields (no eval / Function)
// ---------------------------------------------------------------------------
type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' } | { t: 'rp' } | { t: 'comma' };

const FN_SET = new Set(['MIN', 'MAX', 'ROUND', 'AVG', 'IF']);

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const num = Number(expr.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Invalid number near "${expr.slice(i, j)}"`);
      tokens.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      tokens.push({ t: 'id', v: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (ch === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    if (ch === ',') { tokens.push({ t: 'comma' }); i++; continue; }
    const two = expr.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/<>'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    throw new Error(`Unexpected character "${ch}" in formula`);
  }
  return tokens;
}

class FormulaParser {
  private pos = 0;
  constructor(private tokens: Token[], private env: Record<string, number>) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private next(): Token | undefined { return this.tokens[this.pos++]; }
  private expect(v: string): void {
    const tk = this.next();
    if (!tk || tk.t !== 'op' || tk.v !== v) throw new Error(`Expected "${v}"`);
  }

  parse(): number {
    const value = this.parseComparison();
    if (this.pos < this.tokens.length) throw new Error('Unexpected trailing tokens');
    return value;
  }

  private parseComparison(): number {
    const left = this.parseAddSub();
    const tk = this.peek();
    if (tk && tk.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(tk.v)) {
      this.next();
      const right = this.parseAddSub();
      const a = left; const b = right;
      if (tk.v === '<') return a < b ? 1 : 0;
      if (tk.v === '>') return a > b ? 1 : 0;
      if (tk.v === '<=') return a <= b ? 1 : 0;
      if (tk.v === '>=') return a >= b ? 1 : 0;
      if (tk.v === '==') return a === b ? 1 : 0;
      return a !== b ? 1 : 0;
    }
    return left;
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();
    for (;;) {
      const tk = this.peek();
      if (tk && tk.t === 'op' && (tk.v === '+' || tk.v === '-')) {
        this.next();
        const right = this.parseMulDiv();
        left = tk.v === '+' ? left + right : left - right;
      } else break;
    }
    return left;
  }

  private parseMulDiv(): number {
    let left = this.parseUnary();
    for (;;) {
      const tk = this.peek();
      if (tk && tk.t === 'op' && (tk.v === '*' || tk.v === '/')) {
        this.next();
        const right = this.parseUnary();
        if (tk.v === '/') {
          if (right === 0) throw new Error('Division by zero');
          left = left / right;
        } else left = left * right;
      } else break;
    }
    return left;
  }

  private parseUnary(): number {
    const tk = this.peek();
    if (tk && tk.t === 'op' && (tk.v === '-' || tk.v === '+')) {
      this.next();
      const v = this.parseUnary();
      return tk.v === '-' ? -v : v;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const tk = this.next();
    if (!tk) throw new Error('Unexpected end of formula');
    if (tk.t === 'num') return tk.v;
    if (tk.t === 'lp') {
      const v = this.parseComparison();
      this.expect(')');
      return v;
    }
    if (tk.t === 'id') {
      const name = tk.v;
      if (this.peek() && this.peek()!.t === 'lp') {
        this.next(); // consume '('
        if (!FN_SET.has(name)) throw new Error(`Unknown function "${name}"`);
        const args: number[] = [];
        if (!(this.peek() && this.peek()!.t === 'rp')) {
          args.push(this.parseComparison());
          while (this.peek() && this.peek()!.t === 'comma') {
            this.next();
            args.push(this.parseComparison());
          }
        }
        this.expect(')');
        if (name === 'MIN') return Math.min(...args);
        if (name === 'MAX') return Math.max(...args);
        if (name === 'AVG') return args.length ? args.reduce((a, b) => a + b, 0) / args.length : 0;
        if (name === 'ROUND') return Math.round(args[0] * Math.pow(10, args[1] ?? 0)) / Math.pow(10, args[1] ?? 0);
        if (name === 'IF') return args[0] !== 0 ? args[1] : (args[2] ?? 0);
      }
      if (!(name in this.env)) throw new Error(`Unknown field reference "${name}"`);
      return this.env[name];
    }
    throw new Error('Unexpected token in formula');
  }
}

export function evaluateFormula(expr: string, env: Record<string, number>): number {
  return new FormulaParser(tokenize(expr), env).parse();
}

/** Computes the values of calculated fields (topologically by element order).
 *  Returns the full answer set with calculated values filled in. */
export function computeCalculatedValues(elements: FormElement[], answers: Answers): Answers {
  const out: Answers = { ...answers };
  const env: Record<string, number> = {};
  for (const el of elements) {
    if (el.type === 'calculated' && el.formula) {
      try {
        out[el.key] = evaluateFormula(el.formula, env);
      } catch {
        out[el.key] = null;
      }
    }
    const v = out[el.key];
    if (typeof v === 'number' && Number.isFinite(v)) env[el.key] = v;
  }
  return out;
}

/** Resolves the field keys a formula references (used for validation). */
export function formulaReferences(expr: string): string[] {
  const refs: string[] = [];
  for (const tk of tokenize(expr)) {
    if (tk.t === 'id' && !FN_SET.has(tk.v)) refs.push(tk.v);
  }
  return [...new Set(refs)];
}

// ---------------------------------------------------------------------------
// Rich text sanitization (stored-XSS guard)
// ---------------------------------------------------------------------------
export function sanitizeRichText(html: string): string {
  return String(html)
    // Strip <script> tags and content
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>|<\/?script>/gi, '')
    // Strip dangerous tags: iframe, object, embed, applet, base, meta, link, form
    .replace(/<\s*(iframe|object|embed|applet|base|meta|link|form)[\s\S]*?(?:<\/\1>|\/?>|>)/gi, '')
    // Strip SVG event handlers
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    // Strip on* event handlers (onclick, onerror, onload, etc.)
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Strip javascript: protocol
    .replace(/javascript:/gi, '')
    // Strip data: URIs (except images from same origin)
    .replace(/data:[^image\/]/gi, '')
    // Strip expression() in CSS
    .replace(/expression\s*\(/gi, '')
    // Strip vbscript:
    .replace(/vbscript:/gi, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Scoring (DR-12)
// ---------------------------------------------------------------------------
export interface ScoreResult {
  total: number;
  max: number;
}

function pointsForValue(el: FormElement, value: unknown): number {
  if (el.scoring?.optionPoints && value !== undefined && value !== null && value !== '') {
    if (Array.isArray(value)) {
      return value.reduce((sum, v) => sum + (el.scoring!.optionPoints![String(v)] ?? 0), 0);
    }
    return el.scoring.optionPoints[String(value)] ?? 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function computeScore(elements: FormElement[], answers: Answers): ScoreResult {
  let total = 0;
  let max = 0;
  const states = computeFieldStates(elements, answers);
  for (const el of elements) {
    if (el.type === 'section' || el.type === 'instructions' || el.type === 'calculated' || el.type === 'prefill') continue;
    if (['heading', 'content-image', 'divider', 'spacer', 'button', 'quote', 'container', 'richtext'].includes(el.type)) continue;
    if (!el.scoring) continue;
    if (!states[el.key]?.visible) continue;
    const value = answers[el.key];
    if (el.type === 'matrix') {
      const rows = el.matrixRows ?? [];
      for (const row of rows) {
        const rowVal = (value as Record<string, unknown> | undefined)?.[row];
        total += pointsForValue({ ...el, type: 'multiplechoice' }, rowVal);
        const colCount = Array.isArray(rowVal) ? rowVal.length : (rowVal !== undefined && rowVal !== null && rowVal !== '' ? 1 : 0);
        const perCell = maxPointsPer(el);
        max += perCell * colCount;
      }
      continue;
    }
    total += pointsForValue(el, value);
    max += maxPointsPer(el);
  }
  return { total: Math.round(total * 100) / 100, max: Math.round(max * 100) / 100 };
}

function maxPointsPer(el: FormElement): number {
  if (el.scoring?.maxPoints !== undefined) return el.scoring.maxPoints;
  if (el.scoring?.optionPoints) {
    const vals = Object.values(el.scoring.optionPoints);
    return vals.length ? Math.max(...vals) : 0;
  }
  if (el.type === 'number' || el.type === 'slider' || el.type === 'rating') return el.max ?? 100;
  if (el.type === 'multiplechoice' && el.options && el.maxSelections) return el.maxSelections;
  return 1;
}

// ---------------------------------------------------------------------------
// Response validation (server-side)
// ---------------------------------------------------------------------------
export interface ValidationIssue {
  key: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s-]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T[0-2]\d:[0-5]\d/;

export function validateResponse(elements: FormElement[], answers: Answers): ValidationIssue[] {
  const states = computeFieldStates(elements, answers);
  const issues: ValidationIssue[] = [];

  for (const el of elements) {
    const state = states[el.key];
    if (!state.visible) continue; // hidden/skipped fields excluded from validation

    // Read-only fields (calculated/prefill) are server-computed; ignore input.
    if (el.type === 'calculated' || el.type === 'prefill') continue;

    // Design/content elements don't collect data
    if (['heading', 'content-image', 'divider', 'spacer', 'button', 'quote', 'container', 'richtext'].includes(el.type)) continue;

    const value = answers[el.key];

    if (state.required && isEmpty(value)) {
      issues.push({ key: el.key, message: `"${el.label}" is required` });
      continue;
    }
    if (isEmpty(value)) continue;

    switch (el.type) {
      case 'email':
        if (!EMAIL_RE.test(String(value))) issues.push({ key: el.key, message: `"${el.label}" must be a valid email` });
        break;
      case 'phone':
        if (!PHONE_RE.test(String(value))) issues.push({ key: el.key, message: `"${el.label}" must be a valid phone number` });
        break;
      case 'date':
        if (!DATE_RE.test(String(value))) issues.push({ key: el.key, message: `"${el.label}" must be YYYY-MM-DD` });
        break;
      case 'time':
        if (!TIME_RE.test(String(value))) issues.push({ key: el.key, message: `"${el.label}" must be HH:MM (24h)` });
        break;
      case 'datetime':
        if (!DATETIME_RE.test(String(value))) issues.push({ key: el.key, message: `"${el.label}" must be a valid date-time` });
        break;
      case 'number':
      case 'slider':
      case 'rating': {
        const num = Number(value);
        if (!Number.isFinite(num)) issues.push({ key: el.key, message: `"${el.label}" must be a number` });
        else {
          if (el.min !== undefined && num < el.min) issues.push({ key: el.key, message: `"${el.label}" must be at least ${el.min}` });
          if (el.max !== undefined && num > el.max) issues.push({ key: el.key, message: `"${el.label}" must be at most ${el.max}` });
        }
        break;
      }
      case 'shorttext':
      case 'longtext':
      case 'richtext': {
        const text = String(value);
        if (el.minLength !== undefined && text.length < el.minLength) issues.push({ key: el.key, message: `"${el.label}" must be at least ${el.minLength} characters` });
        if (el.maxLength !== undefined && text.length > el.maxLength) issues.push({ key: el.key, message: `"${el.label}" must be at most ${el.maxLength} characters` });
        if ((el.type === 'shorttext' || el.type === 'longtext') && el.regex) {
          try {
            if (!new RegExp(el.regex).test(text)) issues.push({ key: el.key, message: `"${el.label}" does not match the required format` });
          } catch { /* invalid regex stored; treat as unvalidated */ }
        }
        break;
      }
      case 'dropdown': {
        if (el.options && !el.options.some((o) => String(o) === String(value))) {
          issues.push({ key: el.key, message: `"${el.label}" contains an invalid selection` });
        }
        break;
      }
      case 'multiplechoice': {
        const arr = Array.isArray(value) ? value : [value];
        if (el.minSelections !== undefined && arr.length < el.minSelections) issues.push({ key: el.key, message: `"${el.label}" requires at least ${el.minSelections} selections` });
        if (el.maxSelections !== undefined && arr.length > el.maxSelections) issues.push({ key: el.key, message: `"${el.label}" allows at most ${el.maxSelections} selections` });
        if (el.options) {
          const valid = new Set(el.options.map((o) => String(o)));
          if (arr.some((v) => !valid.has(String(v)))) issues.push({ key: el.key, message: `"${el.label}" contains an invalid selection` });
        }
        break;
      }
      case 'yesno':
        if (!['yes', 'no', true, false].includes(value as any)) issues.push({ key: el.key, message: `"${el.label}" must be Yes or No` });
        break;
      case 'location': {
        const loc = value as { lat?: unknown; lng?: unknown; address?: unknown };
        const hasCoords = Number.isFinite(Number(loc?.lat)) && Number.isFinite(Number(loc?.lng));
        const hasAddress = typeof loc?.address === 'string' && loc.address.trim() !== '';
        if (!hasCoords && !hasAddress) issues.push({ key: el.key, message: `"${el.label}" must provide coordinates or an address` });
        break;
      }
      case 'matrix': {
        const rows = el.matrixRows ?? [];
        const cols = el.matrixColumns ?? [];
        const obj = (value ?? {}) as Record<string, unknown>;
        for (const row of rows) {
          const rowVal = obj[row];
          if (rowVal === undefined || rowVal === null || rowVal === '' || (Array.isArray(rowVal) && rowVal.length === 0)) continue;
          if (el.matrixScale === 'multi') {
            const arr = Array.isArray(rowVal) ? rowVal : [rowVal];
            if (arr.some((v) => !cols.includes(String(v)))) issues.push({ key: el.key, message: `"${el.label}" contains an invalid selection for "${row}"` });
          } else if (!cols.includes(String(rowVal))) {
            issues.push({ key: el.key, message: `"${el.label}" contains an invalid selection for "${row}"` });
          }
        }
        break;
      }
      case 'file':
      case 'image':
      case 'signature': {
        if (Array.isArray(value)) {
          if (el.fileMaxCount !== undefined && value.length > el.fileMaxCount) {
            issues.push({ key: el.key, message: `"${el.label}" allows at most ${el.fileMaxCount} file(s)` });
          }
        }
        break;
      }
      case 'section':
      case 'instructions':
        break;
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Schema integrity checks (envelope-level)
// ---------------------------------------------------------------------------
const PREfill_SOURCES = ['name', 'email', 'static'] as const;

export function validateSchemaEnvelope(schema: FormSchemaEnvelope): string[] {
  const errors: string[] = [];
  const elements = schema.elements;
  const keys = new Set(elements.map((e) => e.key));
  const seen = new Set<string>();
  const order: Record<string, number> = {};
  const pageIds = new Set(schema.pages.map((p) => p.id));

  if (!Array.isArray(schema.pages) || schema.pages.length === 0) {
    errors.push('Form must define at least one page');
  }
  if (schema.branding) {
    const b = schema.branding;
    if (b.primaryColor !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(b.primaryColor)) errors.push('Branding primaryColor must be a hex color');
    if (b.secondaryColor !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(b.secondaryColor)) errors.push('Branding secondaryColor must be a hex color');
  }

  // Dependency map for calculated-field cycle detection.
  const deps: Record<string, string[]> = {};
  const orderedKeys: string[] = [];

  elements.forEach((e, i) => {
    if (!e.key) errors.push(`Element at position ${i + 1} is missing a key`);
    if (seen.has(e.key)) errors.push(`Duplicate field key: ${e.key}`);
    seen.add(e.key);
    orderedKeys.push(e.key);
    order[e.key] = i;
    if (!FIELD_TYPES.includes(e.type)) errors.push(`Field "${e.key}" has unknown type "${e.type}"`);
    if (e.pageId !== undefined && !pageIds.has(e.pageId)) {
      errors.push(`Field "${e.key}" references unknown page "${e.pageId}"`);
    }

    // Conditional / display / branching references.
    for (const cond of [e.conditional, e.displayWhen]) {
      if (cond) {
        for (const rule of normalizeGroup(cond)?.rules ?? []) {
          if (rule && rule.fieldKey && !keys.has(rule.fieldKey)) {
            errors.push(`Field "${e.key}" conditional references unknown field "${rule.fieldKey}"`);
          }
          if (rule && rule.fieldKey === e.key) {
            errors.push(`Field "${e.key}" cannot reference itself in a condition`);
          }
        }
      }
    }
    if (e.branching) {
      const group = normalizeGroup(e.branching.condition);
      for (const rule of group?.rules ?? []) {
        if (rule && rule.fieldKey && !keys.has(rule.fieldKey)) {
          errors.push(`Field "${e.key}" branching references unknown field "${rule.fieldKey}"`);
        }
      }
      if (e.branching.jumpTo && !keys.has(e.branching.jumpTo)) {
        errors.push(`Field "${e.key}" branches to unknown field "${e.branching.jumpTo}"`);
      }
      if (e.branching.jumpTo && order[e.branching.jumpTo] !== undefined && order[e.branching.jumpTo] <= i) {
        errors.push(`Field "${e.key}" branches backwards to "${e.branching.jumpTo}" (circular paths not allowed)`);
      }
    }

    // Type-specific config.
    if (e.type === 'matrix') {
      if (!e.matrixRows || e.matrixRows.length === 0) errors.push(`Matrix field "${e.key}" must define rows`);
      if (!e.matrixColumns || e.matrixColumns.length === 0) errors.push(`Matrix field "${e.key}" must define columns`);
      if (e.matrixScale !== 'single' && e.matrixScale !== 'multi') errors.push(`Matrix field "${e.key}" must define matrixScale`);
    }
    if (e.type === 'location' && e.radiusKm !== undefined && e.radiusKm <= 0) {
      errors.push(`Location field "${e.key}" radius must be positive`);
    }
    if (e.type === 'calculated') {
      if (!e.formula) errors.push(`Calculated field "${e.key}" must define a formula`);
      else {
        try {
          const refs = formulaReferences(e.formula);
          deps[e.key] = refs;
          for (const ref of refs) {
            if (!keys.has(ref)) errors.push(`Calculated field "${e.key}" references unknown field "${ref}"`);
            if (ref === e.key) errors.push(`Calculated field "${e.key}" cannot reference itself`);
          }
        } catch (err) {
          errors.push(`Calculated field "${e.key}" has an invalid formula: ${(err as Error).message}`);
        }
      }
    }
    if (e.type === 'prefill' && e.prefillSource && !(PREfill_SOURCES as readonly string[]).includes(e.prefillSource)) {
      errors.push(`Prefill field "${e.key}" has an invalid prefillSource`);
    }
    if (e.scoring?.optionPoints) {
      const optionKeys = new Set((e.options ?? []).map((o) => String(o)));
      for (const opt of Object.keys(e.scoring.optionPoints)) {
        if (optionKeys.size > 0 && !optionKeys.has(opt) && e.type !== 'matrix') {
          errors.push(`Scoring for "${e.key}" references unknown option "${opt}"`);
        }
      }
    }
  });

  // Calculated-field cycle detection.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    for (const d of deps[key] ?? []) {
      if (visit(d)) return true;
    }
    visiting.delete(key);
    visited.add(key);
    return false;
  };
  for (const key of orderedKeys) {
    if (deps[key] && visit(key)) {
      errors.push(`Calculated field "${key}" is part of a circular dependency`);
    }
  }

  return errors;
}

/** Backward-compatible element-array validation. */
export function validateSchema(elements: FormElement[]): string[] {
  return validateSchemaEnvelope({ schemaVersion: 1, pages: [{ id: 'page-1', title: 'Page 1' }], elements, branding: undefined });
}

/** Stable field ordering by element.order then index. */
export function sortElements(elements: FormElement[]): FormElement[] {
  return [...elements].sort((a, b) => a.order - b.order);
}

// ---------------------------------------------------------------------------
// Envelope parsing & serialization (RT-01, backward compatible)
// ---------------------------------------------------------------------------
const DEFAULT_PAGE: FormPage = { id: 'page-1', title: 'Page 1' };

export function buildEnvelope(elements: FormElement[], branding?: FormBranding, pages?: FormPage[]): FormSchemaEnvelope {
  return {
    schemaVersion: 2,
    pages: pages && pages.length > 0 ? pages : [DEFAULT_PAGE],
    elements: sortElements(elements),
    branding,
  };
}

export function parseSchema(json: string | null | undefined): FormSchemaEnvelope {
  if (!json) return { schemaVersion: 1, pages: [DEFAULT_PAGE], elements: [], branding: undefined };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { schemaVersion: 1, pages: [DEFAULT_PAGE], elements: [], branding: undefined };
  }
  // Legacy bare-array schema.
  if (Array.isArray(raw)) {
    return { schemaVersion: 1, pages: [DEFAULT_PAGE], elements: raw as FormElement[], branding: undefined };
  }
  const obj = raw as Partial<FormSchemaEnvelope>;
  return {
    schemaVersion: obj.schemaVersion ?? 1,
    pages: Array.isArray(obj.pages) && obj.pages.length > 0 ? obj.pages : [DEFAULT_PAGE],
    elements: Array.isArray(obj.elements) ? obj.elements : [],
    branding: obj.branding && typeof obj.branding === 'object' ? obj.branding : undefined,
  };
}

export function serializeSchema(schema: FormSchemaEnvelope): string {
  return JSON.stringify(schema);
}

/** Restores elements on a given page. */
export function elementsOnPage(elements: FormElement[], pageId: string): FormElement[] {
  return elements.filter((e) => (e.pageId ?? 'page-1') === pageId);
}
