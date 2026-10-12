'use client';

// Client-side mirror of backend/src/modules/forms/formSchema.ts so the
// respondent/builder evaluate display conditions, branching, calculated
// fields, and scoring identically. The server re-validates authoritatively.

import type { Answers, ConditionalGroup, ConditionalRule, FormBranding, FormElement, FormPage, FormSchemaEnvelope } from '@/lib/types';

const DEFAULT_PAGE: FormPage = { id: 'page-1', title: 'Page 1' };

export function sortElements(elements: FormElement[]): FormElement[] {
  return [...elements].sort((a, b) => a.order - b.order);
}

export function elementsOnPage(elements: FormElement[], pageId: string): FormElement[] {
  return elements.filter((e) => (e.pageId ?? 'page-1') === pageId);
}

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

export interface FieldState {
  visible: boolean;
  required: boolean;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

function normalize(a: unknown, b: unknown): [string, string] {
  return [String(a ?? '').trim().toLowerCase(), String(b ?? '').trim().toLowerCase()];
}

export function evaluateCondition(rule: ConditionalRule, answers: Answers): boolean {
  const actual = answers[rule.fieldKey];
  switch (rule.operator) {
    case 'empty': return isEmpty(actual);
    case 'not-empty': return !isEmpty(actual);
    case 'eq': return normalize(actual, rule.value)[0] === normalize(rule.value, rule.value)[0];
    case 'neq': return normalize(actual, rule.value)[0] !== normalize(rule.value, rule.value)[0];
    case 'gt': case 'lt': case 'gte': case 'lte': {
      const a = Number(actual); const b = Number(rule.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (rule.operator === 'gt') return a > b;
      if (rule.operator === 'lt') return a < b;
      if (rule.operator === 'gte') return a >= b;
      return a <= b;
    }
    case 'contains': return normalize(actual, rule.value)[0].includes(normalize(rule.value, rule.value)[0]);
    case 'in': {
      if (!Array.isArray(rule.value)) return false;
      return rule.value.some((v) => normalize(actual, v)[0] === normalize(v, v)[0]);
    }
    default: return false;
  }
}

export function normalizeGroup(cond?: ConditionalRule | ConditionalGroup): ConditionalGroup | undefined {
  if (!cond) return undefined;
  if ('rules' in cond && Array.isArray((cond as ConditionalGroup).rules)) return cond as ConditionalGroup;
  return { operator: 'and', rules: [cond as ConditionalRule] };
}

export function evaluateGroup(cond: ConditionalRule | ConditionalGroup | undefined, answers: Answers): boolean {
  const group = normalizeGroup(cond);
  if (!group || group.rules.length === 0) return true;
  const results = group.rules.map((r) => evaluateCondition(r, answers));
  return group.operator === 'or' ? results.some(Boolean) : results.every(Boolean);
}

export function computeFieldStates(elements: FormElement[], answers: Answers): Record<string, FieldState> {
  const states: Record<string, FieldState> = {};
  let skipUntil: string | null = null;
  let endForm = false;
  for (const el of elements) {
    if (endForm) { states[el.key] = { visible: false, required: false }; continue; }
    if (skipUntil) {
      if (el.key === skipUntil) skipUntil = null;
      else { states[el.key] = { visible: false, required: false }; continue; }
    }
    if (el.displayWhen && !evaluateGroup(el.displayWhen, answers)) {
      states[el.key] = { visible: false, required: false };
      continue;
    }
    const required = Boolean(el.required) || (el.conditional ? evaluateGroup(el.conditional, answers) : false);
    states[el.key] = { visible: true, required };
    if (el.branching && el.type !== 'section' && evaluateGroup(el.branching.condition, answers)) {
      if (el.branching.endForm) endForm = true;
      else if (el.branching.jumpTo) skipUntil = el.branching.jumpTo;
    }
  }
  return states;
}

// --- safe formula evaluator (no eval) -------------------------------
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
      if (!Number.isFinite(num)) throw new Error(`Invalid number "${expr.slice(i, j)}"`);
      tokens.push({ t: 'num', v: num });
      i = j; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      tokens.push({ t: 'id', v: expr.slice(i, j) });
      i = j; continue;
    }
    if (ch === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (ch === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    if (ch === ',') { tokens.push({ t: 'comma' }); i++; continue; }
    const two = expr.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/<>'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    throw new Error(`Unexpected character "${ch}"`);
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
      if (tk.v === '<') return left < right ? 1 : 0;
      if (tk.v === '>') return left > right ? 1 : 0;
      if (tk.v === '<=') return left <= right ? 1 : 0;
      if (tk.v === '>=') return left >= right ? 1 : 0;
      if (tk.v === '==') return left === right ? 1 : 0;
      return left !== right ? 1 : 0;
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
        this.next();
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

export function formulaReferences(expr: string): string[] {
  const refs: string[] = [];
  for (const tk of tokenize(expr)) {
    if (tk.t === 'id' && !FN_SET.has(tk.v)) refs.push(tk.v);
  }
  return [...new Set(refs)];
}

export function sanitizeRichText(html: string): string {
  return String(html)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>|<\/?script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<\s*iframe[\s\S]*?<\/iframe>|<iframe\s*\/?>/gi, '')
    .trim();
}

// --- scoring (DR-12) --------------------------------------------------
function pointsForValue(el: FormElement, value: unknown): number {
  if (el.scoring?.optionPoints && value !== undefined && value !== null && value !== '') {
    if (Array.isArray(value)) return value.reduce((sum, v) => sum + (el.scoring!.optionPoints![String(v)] ?? 0), 0);
    return el.scoring.optionPoints[String(value)] ?? 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

export function computeScore(elements: FormElement[], answers: Answers): { total: number; max: number } {
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
        max += maxPointsPer(el) * colCount;
      }
      continue;
    }
    total += pointsForValue(el, value);
    max += maxPointsPer(el);
  }
  return { total: Math.round(total * 100) / 100, max: Math.round(max * 100) / 100 };
}

// --- simple client-side field validation (server is authoritative) ----
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?[\d\s-]{7,20}$/;

export function simpleFieldError(el: FormElement, value: unknown, required: boolean): string | null {
  if (required && isEmpty(value)) return 'This question is required';
  if (isEmpty(value)) return null;
  switch (el.type) {
    case 'email':
      if (!EMAIL_RE.test(String(value))) return 'Enter a valid email address';
      break;
    case 'phone':
      if (!PHONE_RE.test(String(value))) return 'Enter a valid phone number';
      break;
    case 'number': case 'rating': case 'slider': {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'Enter a number';
      if (el.min !== undefined && n < el.min) return `Must be at least ${el.min}`;
      if (el.max !== undefined && n > el.max) return `Must be at most ${el.max}`;
      break;
    }
    case 'shorttext': case 'longtext': {
      const t = String(value);
      if (el.minLength !== undefined && t.length < el.minLength) return `At least ${el.minLength} characters`;
      if (el.maxLength !== undefined && t.length > el.maxLength) return `At most ${el.maxLength} characters`;
      break;
    }
    case 'dropdown':
      if (el.options && !el.options.some((o) => String(o) === String(value))) return 'Select a valid option';
      break;
    case 'multiplechoice': {
      const arr = Array.isArray(value) ? value : value ? [String(value)] : [];
      if (el.minSelections !== undefined && arr.length < el.minSelections) return `Select at least ${el.minSelections}`;
      if (el.maxSelections !== undefined && arr.length > el.maxSelections) return `Select at most ${el.maxSelections}`;
      break;
    }
    case 'yesno':
      if (!['yes', 'no', true, false].includes(value as any)) return 'Answer Yes or No';
      break;
    case 'location': {
      const loc = value as { lat?: unknown; lng?: unknown; address?: unknown };
      const hasCoords = Number.isFinite(Number(loc?.lat)) && Number.isFinite(Number(loc?.lng));
      if (!hasCoords && typeof loc?.address !== 'string') return 'Provide a location';
      break;
    }
    default: break;
  }
  return null;
}