'use client';

import { useState } from 'react';
import { Button, Icon } from '@/components/ui';
import type { ConditionalGroup, ConditionalRule, FormBranding, FormElement, FormPage, FieldStyle } from '@/lib/types';
import {
  FIELD_TYPE_MAP,
  OPERATORS,
  type FieldMeta,
} from './FormBuilderState';
import { SignaturePad } from './SignaturePad';
import { RichTextEditor } from './RichTextEditor';

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------
function Section({ title, icon, defaultOpen = true, children }: {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bp-section">
      <button className="bp-section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {icon && <Icon name={icon} />}
        <span>{title}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} className="bp-section-chevron" />
      </button>
      {open && <div className="bp-section-body">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property row
// ---------------------------------------------------------------------------
function Prop({ label, hint, children, inline }: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={`bp-row ${inline ? 'bp-row-inline' : ''}`}>
      <label className="bp-label">{label}</label>
      {children}
      {hint && <span className="bp-hint">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Condition editor
// ---------------------------------------------------------------------------
function ConditionEditor({ value, onChange, fields, selfKey }: {
  value?: ConditionalRule;
  onChange: (v: ConditionalRule | undefined) => void;
  fields: FormElement[];
  selfKey?: string;
}) {
  const others = fields.filter((f) => f.key !== selfKey && f.type !== 'section' && f.type !== 'instructions');
  return (
    <div className="bp-condition">
      <select
        className="select bp-condition-field"
        value={value?.fieldKey ?? ''}
        onChange={(e) => onChange(e.target.value ? { fieldKey: e.target.value, operator: value?.operator ?? 'eq', value: value?.value } : undefined)}
      >
        <option value="">— field —</option>
        {others.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <select
        className="select bp-condition-op"
        disabled={!value}
        value={value?.operator ?? ''}
        onChange={(e) => onChange({ ...value!, operator: e.target.value })}
      >
        {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {value && !['empty', 'not-empty'].includes(value.operator) ? (
        value.operator === 'in' ? (
          <input
            className="input bp-condition-val"
            placeholder="a, b, c"
            value={Array.isArray(value.value) ? (value.value as string[]).join(', ') : String(value.value ?? '')}
            onChange={(e) => onChange({ ...value, value: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
        ) : (
          <input
            className="input bp-condition-val"
            placeholder="value"
            value={String(value.value ?? '')}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          />
        )
      ) : null}
      <button className="btn btn-ghost btn-sm bp-condition-clear" title="Clear" onClick={() => onChange(undefined)}>
        <Icon name="xmark" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group rule editor (AND/OR conditions)
// ---------------------------------------------------------------------------
function GroupRuleEditor({ value, onChange, fields, selfKey, label }: {
  value?: ConditionalRule | ConditionalGroup;
  onChange: (v: ConditionalRule | ConditionalGroup | undefined) => void;
  fields: FormElement[];
  selfKey?: string;
  label: string;
}) {
  const rules: ConditionalRule[] = value && 'rules' in value && Array.isArray(value.rules)
    ? (value as ConditionalGroup).rules
    : value ? [value as ConditionalRule] : [];

  return (
    <div className="bp-group-rule">
      <div className="bp-group-rule-label">{label}</div>
      {rules.map((r, i) => (
        <div key={i} className="bp-group-rule-row">
          <ConditionEditor
            value={r}
            fields={fields}
            selfKey={selfKey}
            onChange={(next) => {
              if (next === undefined) {
                const rest = rules.filter((_, j) => j !== i);
                onChange(rest.length === 1 ? rest[0] : rest.length > 1 ? { operator: 'and', rules: rest } : undefined);
              } else {
                const nextRules = rules.map((rr, j) => (j === i ? next : rr));
                onChange(nextRules.length === 1 ? nextRules[0] : { operator: 'and', rules: nextRules });
              }
            }}
          />
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => {
        const base: ConditionalRule = rules[0] ?? { fieldKey: fields[0]?.key ?? '', operator: 'eq' as const, value: undefined };
        onChange({ operator: 'and', rules: [...rules, { ...base }] });
      }}>
        <Icon name="plus" /> Add condition
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Design / Logic / Advanced tab selector
// ---------------------------------------------------------------------------
type PanelTab = 'design' | 'logic' | 'advanced';

function TabSelector({ active, onChange }: { active: PanelTab; onChange: (t: PanelTab) => void }) {
  return (
    <div className="bp-tabs">
      {(['design', 'logic', 'advanced'] as const).map((t) => (
        <button
          key={t}
          className={`bp-tab ${active === t ? 'active' : ''}`}
          onClick={() => onChange(t)}
        >
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Design tab content
// ---------------------------------------------------------------------------
function DesignTab({ el, fields, onPatch }: { el: FormElement; fields: FormElement[]; onPatch: (p: Partial<FormElement>) => void }) {
  const meta = FIELD_TYPE_MAP[el.type];
  const isLayout = el.type === 'section' || el.type === 'instructions';
  const isDesign = el.type === 'heading' || el.type === 'content-image' || el.type === 'divider' || el.type === 'spacer' || el.type === 'button' || el.type === 'quote' || el.type === 'container';
  const isCalcOrPrefill = el.type === 'calculated' || el.type === 'prefill';
  const hasOptions = el.type === 'dropdown' || el.type === 'multiplechoice';
  const isNumeric = el.type === 'number' || el.type === 'slider' || el.type === 'rating';
  const isText = el.type === 'shorttext' || el.type === 'longtext';
  const isFile = el.type === 'file' || el.type === 'image' || el.type === 'signature';
  const isNonInput = isLayout || isDesign || isCalcOrPrefill;

  return (
    <>
      <Section title="Basic" icon="palette">
        <Prop label="Label">
          <input className="input" value={el.label} onChange={(e) => onPatch({ label: e.target.value })} />
        </Prop>
        {!isNonInput && (
          <Prop label="Description">
            <input className="input" value={el.description ?? ''} onChange={(e) => onPatch({ description: e.target.value })} placeholder="Optional help text" />
          </Prop>
        )}
        {!isNonInput && !['yesno', 'rating', 'slider'].includes(el.type) && (
          <Prop label="Placeholder">
            <input className="input" value={el.placeholder ?? ''} onChange={(e) => onPatch({ placeholder: e.target.value })} />
          </Prop>
        )}
        {el.type === 'heading' && (
          <Prop label="Heading level">
            <select className="select" value={el.headingLevel ?? 2} onChange={(e) => onPatch({ headingLevel: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6 })}>
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
              <option value={4}>H4</option>
              <option value={5}>H5</option>
              <option value={6}>H6</option>
            </select>
          </Prop>
        )}
        {el.type === 'content-image' && (
          <>
            <Prop label="Image URL">
              <input className="input" value={el.imageUrl ?? ''} onChange={(e) => onPatch({ imageUrl: e.target.value })} placeholder="https://..." />
            </Prop>
            <Prop label="Alt text">
              <input className="input" value={el.imageAlt ?? ''} onChange={(e) => onPatch({ imageAlt: e.target.value })} placeholder="Descriptive text" />
            </Prop>
            <Prop label="Caption">
              <input className="input" value={el.imageCaption ?? ''} onChange={(e) => onPatch({ imageCaption: e.target.value })} />
            </Prop>
            <Prop label="Object fit">
              <select className="select" value={el.imageFit ?? 'cover'} onChange={(e) => onPatch({ imageFit: e.target.value as 'cover' | 'contain' | 'fill' | 'none' })}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Fill</option>
                <option value="none">None</option>
              </select>
            </Prop>
            <Prop label="Border radius (px)">
              <input className="input" type="number" min={0} value={el.imageBorderRadius ?? 8} onChange={(e) => onPatch({ imageBorderRadius: Number(e.target.value) })} />
            </Prop>
          </>
        )}
        {el.type === 'divider' && (
          <>
            <Prop label="Style">
              <select className="select" value={el.dividerStyle ?? 'solid'} onChange={(e) => onPatch({ dividerStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </Prop>
            <Prop label="Color">
              <input type="color" className="bp-color-picker" value={el.dividerColor ?? '#e0e0e0'} onChange={(e) => onPatch({ dividerColor: e.target.value })} />
            </Prop>
          </>
        )}
        {el.type === 'spacer' && (
          <Prop label="Height (px)">
            <input className="input" type="number" min={8} max={400} value={el.spacerHeight ?? 40} onChange={(e) => onPatch({ spacerHeight: Number(e.target.value) })} />
          </Prop>
        )}
        {el.type === 'button' && (
          <>
            <Prop label="Button text">
              <input className="input" value={el.buttonLabel ?? ''} onChange={(e) => onPatch({ buttonLabel: e.target.value })} />
            </Prop>
            <Prop label="Link URL">
              <input className="input" value={el.buttonUrl ?? ''} onChange={(e) => onPatch({ buttonUrl: e.target.value })} placeholder="https://..." />
            </Prop>
            <Prop label="Variant">
              <select className="select" value={el.buttonVariant ?? 'primary'} onChange={(e) => onPatch({ buttonVariant: e.target.value as 'primary' | 'secondary' | 'ghost' })}>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="ghost">Ghost</option>
              </select>
            </Prop>
          </>
        )}
        {el.type === 'quote' && (
          <>
            <Prop label="Quote text">
              <textarea className="textarea" style={{ minHeight: 60 }} value={el.quoteContent ?? ''} onChange={(e) => onPatch({ quoteContent: e.target.value })} />
            </Prop>
            <Prop label="Author">
              <input className="input" value={el.quoteAuthor ?? ''} onChange={(e) => onPatch({ quoteAuthor: e.target.value })} />
            </Prop>
          </>
        )}
        {el.type === 'richtext' && (
          <Prop label="Content">
            <RichTextEditor value={el.contentHtml ?? el.label} onChange={(html) => onPatch({ contentHtml: html })} placeholder="Start typing…" minHeight={140} />
          </Prop>
        )}
        {el.type === 'signature' && (
          <>
            <Prop label="Pen color">
              <input type="color" className="bp-color-picker" value={el.penColor ?? '#000000'} onChange={(e) => onPatch({ penColor: e.target.value })} />
            </Prop>
            <Prop label="Pen width">
              <input className="input" type="number" min={1} max={10} value={el.penWidth ?? 2} onChange={(e) => onPatch({ penWidth: Number(e.target.value) })} />
            </Prop>
            <Prop label="Height (px)">
              <input className="input" type="number" min={80} max={600} value={el.signatureHeight ?? 200} onChange={(e) => onPatch({ signatureHeight: Number(e.target.value) })} />
            </Prop>
          </>
        )}
      </Section>

      {hasOptions && (
        <Section title="Options" icon="list">
          <Prop label="Choices (one per line)">
            <textarea
              className="textarea"
              style={{ minHeight: 80 }}
              value={(el.options ?? []).join('\n')}
              onChange={(e) => onPatch({ options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
            />
          </Prop>
          {el.type === 'multiplechoice' && (
            <>
              <Prop label="Min selections">
                <input className="input" type="number" min={0} value={el.minSelections ?? ''} onChange={(e) => onPatch({ minSelections: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </Prop>
              <Prop label="Max selections">
                <input className="input" type="number" min={0} value={el.maxSelections ?? ''} onChange={(e) => onPatch({ maxSelections: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </Prop>
            </>
          )}
        </Section>
      )}

      {isNumeric && (
        <Section title="Range" icon="sliders">
          <div className="bp-row-pair">
            <Prop label="Min">
              <input className="input" type="number" value={el.min ?? ''} onChange={(e) => onPatch({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </Prop>
            <Prop label="Max">
              <input className="input" type="number" value={el.max ?? ''} onChange={(e) => onPatch({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </Prop>
          </div>
        </Section>
      )}

      {isText && (
        <Section title="Length" icon="ruler">
          <div className="bp-row-pair">
            <Prop label="Min length">
              <input className="input" type="number" min={0} value={el.minLength ?? ''} onChange={(e) => onPatch({ minLength: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </Prop>
            <Prop label="Max length">
              <input className="input" type="number" min={0} value={el.maxLength ?? ''} onChange={(e) => onPatch({ maxLength: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </Prop>
          </div>
        </Section>
      )}

      {isFile && (
        <Section title="File settings" icon="paperclip">
          <Prop label="Allowed types">
            <input className="input" value={(el.fileAllowedTypes ?? []).join(', ')} onChange={(e) => onPatch({ fileAllowedTypes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="e.g. .pdf, .jpg, .png" />
          </Prop>
          <Prop label="Max count">
            <input className="input" type="number" min={1} value={el.fileMaxCount ?? ''} onChange={(e) => onPatch({ fileMaxCount: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </Prop>
          <Prop label="Max size (MB)">
            <input className="input" type="number" min={1} value={el.fileMaxSizeMB ?? ''} onChange={(e) => onPatch({ fileMaxSizeMB: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </Prop>
        </Section>
      )}

      {el.type === 'location' && (
        <Section title="Location settings" icon="location-dot">
          <Prop label="Radius restriction (km)">
            <input className="input" type="number" min={0} step={0.1} value={el.radiusKm ?? ''} onChange={(e) => onPatch({ radiusKm: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </Prop>
        </Section>
      )}

      {el.type === 'matrix' && (
        <Section title="Matrix settings" icon="table-cells">
          <Prop label="Rows (one per line)">
            <textarea className="textarea" style={{ minHeight: 60 }} value={el.matrixRows?.join('\n') ?? ''} onChange={(e) => onPatch({ matrixRows: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
          </Prop>
          <Prop label="Columns (one per line)">
            <textarea className="textarea" style={{ minHeight: 60 }} value={el.matrixColumns?.join('\n') ?? ''} onChange={(e) => onPatch({ matrixColumns: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
          </Prop>
          <Prop label="Scale">
            <select className="select" value={el.matrixScale ?? 'single'} onChange={(e) => onPatch({ matrixScale: e.target.value === 'single' ? 'single' : 'multi' })}>
              <option value="single">Single choice per row</option>
              <option value="multi">Multiple choices per row</option>
            </select>
          </Prop>
        </Section>
      )}

      {el.type === 'calculated' && (
        <Section title="Formula" icon="calculator">
          <Prop label="Expression">
            <textarea
              className="textarea mono"
              style={{ minHeight: 64 }}
              value={el.formula ?? ''}
              placeholder="e.g. qty * price - discount"
              onChange={(e) => onPatch({ formula: e.target.value })}
            />
          </Prop>
          <div className="bp-hint">References fields by key. Functions: MIN, MAX, ROUND, AVG, IF, + - * / comparisons.</div>
        </Section>
      )}

      {el.type === 'prefill' && (
        <Section title="Prefill source" icon="wand-magic-sparkles">
          <Prop label="Source">
            <select className="select" value={el.prefillSource ?? 'name'} onChange={(e) => onPatch({ prefillSource: e.target.value === 'name' || e.target.value === 'email' ? e.target.value : 'static' })}>
              <option value="name">Respondent name</option>
              <option value="email">Respondent email</option>
              <option value="static">Static value</option>
            </select>
          </Prop>
          {el.prefillSource === 'static' && (
            <Prop label="Value">
              <input className="input" value={el.prefillValue ?? ''} onChange={(e) => onPatch({ prefillValue: e.target.value })} />
            </Prop>
          )}
        </Section>
      )}

      <Section title="Appearance" icon="eye" defaultOpen={false}>
        <Prop label="Read-only">
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(el.isReadOnly)} onChange={(e) => onPatch({ isReadOnly: e.target.checked || undefined })} />
            Prevent editing
          </label>
        </Prop>
      </Section>

      <Section title="Layout" icon="table-columns" defaultOpen={false}>
        <Prop label="Column width">
          <div className="bp-col-btns">
            {[1, 2, 3, 4].map((w) => (
              <button
                key={w}
                className={`bp-col-btn ${(el.layout?.columnWidth ?? 4) === w ? 'active' : ''}`}
                onClick={() => onPatch({ layout: { ...(el.layout ?? {}), columnWidth: w as 1 | 2 | 3 | 4 } })}
                title={w === 1 ? '25%' : w === 2 ? '50%' : w === 3 ? '75%' : '100%'}
                type="button"
              >
                {w === 1 ? '¼' : w === 2 ? '½' : w === 3 ? '¾' : '1'}
              </button>
            ))}
          </div>
        </Prop>
        <Prop label="Row gap (px)">
          <input className="input" type="number" min={0} max={40} value={el.layout?.rowGap ?? ''} onChange={(e) => onPatch({ layout: { ...(el.layout ?? {}), rowGap: e.target.value === '' ? undefined : Number(e.target.value) } })} placeholder="Default" />
        </Prop>
        <Prop label="Force row break">
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(el.layout?.forceRowBreak)} onChange={(e) => onPatch({ layout: { ...(el.layout ?? {}), forceRowBreak: e.target.checked || undefined } })} />
            Start new row before this field
          </label>
        </Prop>
      </Section>

      {el.type === 'container' && (
        <Section title="Container layout" icon="table-cells-large" defaultOpen={false}>
          <Prop label="Columns">
            <div className="bp-row">
              {[1, 2, 3].map(n => (
                <button key={n} className={`btn btn-ghost btn-sm ${el.containerLayout?.columns === n ? 'active' : ''}`}
                  onClick={() => onPatch({ containerLayout: { ...(el.containerLayout ?? {}), columns: n as 1 | 2 | 3 } })}
                  type="button">{n}</button>
              ))}
            </div>
          </Prop>
          <Prop label="Gap">
            <input className="input" type="number" min={0} max={40} step={2}
              value={el.containerLayout?.gap ?? 12}
              onChange={(e) => onPatch({ containerLayout: { ...(el.containerLayout ?? {}), gap: Number(e.target.value) } })}
            />
          </Prop>
          <Prop label="Background">
            <input type="color" className="bp-color-picker"
              value={el.containerLayout?.background ?? '#ffffff'}
              onChange={(e) => onPatch({ containerLayout: { ...(el.containerLayout ?? {}), background: e.target.value } })}
            />
          </Prop>
          <Prop label="Padding">
            <input className="input"
              value={el.containerLayout?.padding ?? ''}
              onChange={(e) => onPatch({ containerLayout: { ...(el.containerLayout ?? {}), padding: e.target.value || undefined } })}
              placeholder="e.g. 16px"
            />
          </Prop>
          <Prop label="Border">
            <input className="input"
              value={el.containerLayout?.border ?? ''}
              onChange={(e) => onPatch({ containerLayout: { ...(el.containerLayout ?? {}), border: e.target.value || undefined } })}
              placeholder="e.g. 2px dashed #ccc"
            />
          </Prop>
          <Prop label="Border radius">
            <input className="input"
              value={el.containerLayout?.borderRadius ?? ''}
              onChange={(e) => onPatch({ containerLayout: { ...(el.containerLayout ?? {}), borderRadius: e.target.value || undefined } })}
              placeholder="e.g. 8px"
            />
          </Prop>
        </Section>
      )}

      <Section title="Position" icon="up-down-left-right" defaultOpen={false}>
        <div className="bp-row-pair">
          <Prop label="X (px)">
            <input className="input" type="number" min={0} value={el.x ?? ''} onChange={(e) => onPatch({ x: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Flow" />
          </Prop>
          <Prop label="Y (px)">
            <input className="input" type="number" min={0} value={el.y ?? ''} onChange={(e) => onPatch({ y: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Flow" />
          </Prop>
        </div>
        <div className="bp-row-pair">
          <Prop label="Width (px)">
            <input className="input" type="number" min={80} value={el.posWidth ?? ''} onChange={(e) => onPatch({ posWidth: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="280" />
          </Prop>
          <Prop label="Height (px)">
            <input className="input" type="number" min={0} value={el.posHeight ?? ''} onChange={(e) => onPatch({ posHeight: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Auto" />
          </Prop>
        </div>
        {el.x != null && el.y != null && (
          <Prop label="">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => onPatch({ x: undefined, y: undefined, posWidth: undefined, posHeight: undefined })}>
              <Icon name="arrow-down" /> Return to flow
            </button>
          </Prop>
        )}
      </Section>

      <Section title="Alignment" icon="align-center" defaultOpen={false}>
        <Prop label="Vertical">
          <div className="bp-row">
            {[
              { value: 'start', icon: 'arrow-up', label: 'Top' },
              { value: 'center', icon: 'arrows-up-down', label: 'Middle' },
              { value: 'end', icon: 'arrow-down', label: 'Bottom' },
              { value: 'stretch', icon: 'up-down-left-right', label: 'Stretch' },
            ].map(({ value, icon, label: lbl }) => (
              <button key={value} className={`btn btn-ghost btn-sm ${el.style?.alignSelf === value ? 'active' : ''}`}
                onClick={() => onPatch({ style: { ...(el.style ?? {}), alignSelf: value as 'start' | 'center' | 'end' | 'stretch' } })}
                type="button" title={lbl}>
                <Icon name={icon} />
              </button>
            ))}
          </div>
        </Prop>
        <Prop label="Horizontal">
          <div className="bp-row">
            {[
              { value: 'start', icon: 'arrow-left', label: 'Left' },
              { value: 'center', icon: 'arrows-left-right', label: 'Center' },
              { value: 'end', icon: 'arrow-right', label: 'Right' },
              { value: 'stretch', icon: 'up-down-left-right', label: 'Stretch' },
            ].map(({ value, icon, label: lbl }) => (
              <button key={value} className={`btn btn-ghost btn-sm ${el.style?.justifySelf === value ? 'active' : ''}`}
                onClick={() => onPatch({ style: { ...(el.style ?? {}), justifySelf: value as 'start' | 'center' | 'end' | 'stretch' } })}
                type="button" title={lbl}>
                <Icon name={icon} />
              </button>
            ))}
          </div>
        </Prop>
      </Section>

      <Section title="Style" icon="palette" defaultOpen={false}>
        <Prop label="Font family">
          <select className="select" value={el.style?.fontFamily ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), fontFamily: e.target.value || undefined } })}>
            <option value="">Default</option>
            <option value="inherit">Inherit</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Courier New', monospace">Courier New</option>
            <option value="Verdana, sans-serif">Verdana</option>
            <option value="Tahoma, sans-serif">Tahoma</option>
          </select>
        </Prop>
        <div className="bp-row-pair">
          <Prop label="Font size">
            <select className="select" value={el.style?.fontSize ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), fontSize: e.target.value || undefined } })}>
              <option value="">Default</option>
              <option value="12px">12px</option>
              <option value="13px">13px</option>
              <option value="14px">14px</option>
              <option value="16px">16px</option>
              <option value="18px">18px</option>
              <option value="20px">20px</option>
              <option value="24px">24px</option>
            </select>
          </Prop>
          <Prop label="Font weight">
            <select className="select" value={el.style?.fontWeight ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), fontWeight: e.target.value || undefined } })}>
              <option value="">Default</option>
              <option value="300">Light</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
            </select>
          </Prop>
        </div>
        <div className="bp-row-pair">
          <Prop label="Font color">
            <input type="color" className="bp-color-picker" value={el.style?.fontColor ?? '#000000'} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), fontColor: e.target.value } })} />
          </Prop>
          <Prop label="Text align">
            <select className="select" value={el.style?.textAlign ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), textAlign: e.target.value as FieldStyle['textAlign'] || undefined } })}>
              <option value="">Default</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
              <option value="justify">Justify</option>
            </select>
          </Prop>
        </div>

        <Prop label="Label size">
          <select className="select" value={el.style?.labelSize ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), labelSize: e.target.value || undefined } })}>
            <option value="">Default</option>
            <option value="11px">11px</option>
            <option value="12px">12px</option>
            <option value="13px">13px</option>
            <option value="14px">14px</option>
            <option value="16px">16px</option>
          </select>
        </Prop>
        <div className="bp-row-pair">
          <Prop label="Label weight">
            <select className="select" value={el.style?.labelWeight ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), labelWeight: e.target.value || undefined } })}>
              <option value="">Default</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
            </select>
          </Prop>
          <Prop label="Label color">
            <input type="color" className="bp-color-picker" value={el.style?.labelColor ?? '#000000'} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), labelColor: e.target.value } })} />
          </Prop>
        </div>
        <Prop label="Label position">
          <select className="select" value={el.style?.labelPosition ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), labelPosition: e.target.value as FieldStyle['labelPosition'] || undefined } })}>
            <option value="">Default (top)</option>
            <option value="top">Top</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </Prop>
        <Prop label="Hide label">
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(el.style?.hideLabel)} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), hideLabel: e.target.checked || undefined } })} />
            Hide field label
          </label>
        </Prop>

        <Prop label="Input background">
          <input type="color" className="bp-color-picker" value={el.style?.inputBg ?? '#ffffff'} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), inputBg: e.target.value } })} />
        </Prop>
        <div className="bp-row-pair">
          <Prop label="Border">
            <input className="input" value={el.style?.inputBorder ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), inputBorder: e.target.value || undefined } })} placeholder="1px solid #ccc" />
          </Prop>
          <Prop label="Border color">
            <input type="color" className="bp-color-picker" value={el.style?.inputBorderColor ?? '#cccccc'} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), inputBorderColor: e.target.value } })} />
          </Prop>
        </div>
        <div className="bp-row-pair">
          <Prop label="Border radius">
            <input className="input" value={el.style?.inputBorderRadius ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), inputBorderRadius: e.target.value || undefined } })} placeholder="6px" />
          </Prop>
          <Prop label="Box shadow">
            <input className="input" value={el.style?.inputShadow ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), inputShadow: e.target.value || undefined } })} placeholder="0 1px 3px rgba(0,0,0,0.1)" />
          </Prop>
        </div>
        <div className="bp-row-pair">
          <Prop label="Padding H">
            <input className="input" value={el.style?.inputPaddingH ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), inputPaddingH: e.target.value || undefined } })} placeholder="12px" />
          </Prop>
          <Prop label="Padding V">
            <input className="input" value={el.style?.inputPaddingV ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), inputPaddingV: e.target.value || undefined } })} placeholder="8px" />
          </Prop>
        </div>

        <Prop label="Focus border color">
          <input type="color" className="bp-color-picker" value={el.style?.focusBorderColor ?? '#0047ab'} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), focusBorderColor: e.target.value } })} />
        </Prop>
        <Prop label="Focus shadow">
          <input className="input" value={el.style?.focusShadow ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), focusShadow: e.target.value || undefined } })} placeholder="0 0 0 3px rgba(0,71,171,0.15)" />
        </Prop>

        <Prop label="Field width">
          <select className="select" value={el.style?.width ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), width: e.target.value || undefined } })}>
            <option value="">Default</option>
            <option value="25%">25%</option>
            <option value="33%">33%</option>
            <option value="50%">50%</option>
            <option value="66%">66%</option>
            <option value="75%">75%</option>
            <option value="100%">100%</option>
          </select>
        </Prop>

        <Prop label="Field margin">
          <input className="input" value={el.style?.fieldMargin ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), fieldMargin: e.target.value || undefined } })} placeholder="e.g. 0 0 12px 0" />
        </Prop>
        <Prop label="Field padding">
          <input className="input" value={el.style?.fieldPadding ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), fieldPadding: e.target.value || undefined } })} placeholder="e.g. 16px 18px" />
        </Prop>
        <Prop label="Min height">
          <input className="input" type="number" min={0} step={10} value={el.style?.minHeight ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), minHeight: e.target.value ? `${e.target.value}px` : undefined } })} placeholder="px" />
        </Prop>

        <Prop label="Hide description">
          <label className="bp-toggle">
            <input type="checkbox" checked={el.style?.hideDescription ?? false} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), hideDescription: e.target.checked || undefined } })} />
            <span className="bp-toggle-slider" />
          </label>
        </Prop>
        <Prop label="Description size">
          <select className="select" value={el.style?.descriptionSize ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), descriptionSize: e.target.value || undefined } })}>
            <option value="">Default</option>
            <option value="11px">11px</option>
            <option value="12px">12px</option>
            <option value="13px">13px</option>
            <option value="14px">14px</option>
            <option value="15px">15px</option>
            <option value="16px">16px</option>
          </select>
        </Prop>
        <Prop label="Description color">
          <input type="color" className="bp-color-picker" value={el.style?.descriptionColor ?? '#6b7280'} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), descriptionColor: e.target.value } })} />
        </Prop>

        <Prop label="Placeholder color">
          <input type="color" className="bp-color-picker" value={el.style?.placeholderColor ?? '#9ca3af'} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), placeholderColor: e.target.value } })} />
        </Prop>
        <Prop label="Hover border color">
          <input type="color" className="bp-color-picker" value={el.style?.hoverBorderColor ?? '#0047ab'} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), hoverBorderColor: e.target.value } })} />
        </Prop>
        <Prop label="Required color">
          <input type="color" className="bp-color-picker" value={el.style?.requiredColor ?? '#dc2626'} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), requiredColor: e.target.value } })} />
        </Prop>

        <Prop label="Label gap">
          <input className="input" value={el.style?.labelGap ?? ''} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), labelGap: e.target.value || undefined } })} placeholder="e.g. 8px" />
        </Prop>
        <Prop label="Hide placeholder">
          <label className="bp-toggle">
            <input type="checkbox" checked={el.style?.hidePlaceholder ?? false} onChange={(e) => onPatch({ style: { ...(el.style ?? {}), hidePlaceholder: e.target.checked || undefined } })} />
            <span className="bp-toggle-slider" />
          </label>
        </Prop>

        <Prop label="Reset style">
          <button className="btn btn-ghost btn-sm" onClick={() => onPatch({ style: undefined })} type="button">
            <Icon name="rotate-left" /> Reset to default
          </button>
        </Prop>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Logic tab content
// ---------------------------------------------------------------------------
function LogicTab({ el, fields, onPatch }: { el: FormElement; fields: FormElement[]; onPatch: (p: Partial<FormElement>) => void }) {
  const isNonInput = el.type === 'section' || el.type === 'instructions' || el.type === 'heading' || el.type === 'divider' || el.type === 'spacer' || el.type === 'button' || el.type === 'quote' || el.type === 'container' || el.type === 'content-image' || el.type === 'richtext' || el.type === 'calculated' || el.type === 'prefill';

  if (isNonInput) {
    return (
      <div className="bp-empty-state">
        <Icon name="code-branch" />
        <span>Logic is not applicable for this field type.</span>
      </div>
    );
  }

  return (
    <>
      <Section title="Required" icon="asterisk">
        <Prop label="Always required">
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(el.required)} onChange={(e) => onPatch({ required: e.target.checked })} />
            This field must be filled
          </label>
        </Prop>
        <GroupRuleEditor
          label="Required only if…"
          value={el.conditional}
          onChange={(v) => onPatch({ conditional: v })}
          fields={fields}
          selfKey={el.key}
        />
      </Section>

      <Section title="Visibility" icon="eye">
        <GroupRuleEditor
          label="Show this field only if…"
          value={el.displayWhen}
          onChange={(v) => onPatch({ displayWhen: v })}
          fields={fields}
          selfKey={el.key}
        />
      </Section>

      <Section title="Branching" icon="code-branch">
        <GroupRuleEditor
          label="When this condition matches…"
          value={el.branching?.condition}
          onChange={(v) => onPatch({ branching: v ? { ...(el.branching ?? {}), condition: v } : undefined })}
          fields={fields}
          selfKey={el.key}
        />
        {el.branching && (
          <div className="bp-branching-action">
            <select
              className="select"
              value={el.branching.endForm ? 'end' : el.branching.jumpTo ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'end') onPatch({ branching: { ...el.branching!, endForm: true, jumpTo: undefined } });
                else if (v === '') onPatch({ branching: { ...el.branching!, endForm: false, jumpTo: undefined } });
                else onPatch({ branching: { ...el.branching!, endForm: false, jumpTo: v } });
              }}
            >
              <option value="">then… continue normally</option>
              {fields.filter((f) => f.key !== el.key && f.order > el.order).map((f) => (
                <option key={f.key} value={f.key}>jump to &ldquo;{f.label}&rdquo;</option>
              ))}
              <option value="end">end the form</option>
            </select>
            <button className="btn btn-ghost btn-sm" title="Clear branching" onClick={() => onPatch({ branching: undefined })}>
              <Icon name="xmark" />
            </button>
          </div>
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Advanced tab content
// ---------------------------------------------------------------------------
function AdvancedTab({ el, fields, onPatch }: { el: FormElement; fields: FormElement[]; onPatch: (p: Partial<FormElement>) => void }) {
  const isNonInput = el.type === 'section' || el.type === 'instructions' || el.type === 'heading' || el.type === 'divider' || el.type === 'spacer' || el.type === 'button' || el.type === 'quote' || el.type === 'container' || el.type === 'content-image' || el.type === 'richtext' || el.type === 'calculated' || el.type === 'prefill';
  const hasOptions = el.type === 'dropdown' || el.type === 'multiplechoice';
  const isText = el.type === 'shorttext' || el.type === 'longtext';

  return (
    <>
      <Section title="Validation" icon="shield-check">
        {isText && (
          <>
            <Prop label="Regex pattern">
              <input className="input mono" value={el.regex ?? ''} onChange={(e) => onPatch({ regex: e.target.value || undefined })} placeholder="e.g. ^[A-Z].*" />
            </Prop>
            <div className="bp-hint">Custom validation pattern. Leave empty for no pattern check.</div>
          </>
        )}
        {!isNonInput && (
          <Prop label="Field key">
            <input className="input mono" value={el.key} onChange={(e) => onPatch({ key: e.target.value.replace(/\s+/g, '_') })} />
          </Prop>
        )}
      </Section>

      {!isNonInput && (
        <Section title="Scoring" icon="trophy">
          {hasOptions || el.type === 'yesno' || el.type === 'rating' || el.type === 'matrix' ? (
            <>
              {el.type === 'matrix' ? (
                <Prop label="Points per row">
                  <input className="input" type="number" min={0} value={el.scoring?.maxPoints ?? ''} onChange={(e) => onPatch({ scoring: { ...(el.scoring ?? {}), maxPoints: e.target.value === '' ? undefined : Number(e.target.value) } })} />
                </Prop>
              ) : hasOptions ? (
                (el.options ?? []).map((opt) => (
                  <div key={opt} className="bp-scoring-row">
                    <span className="bp-scoring-label">{opt}</span>
                    <input
                      className="input bp-scoring-input"
                      type="number"
                      min={0}
                      placeholder="pts"
                      value={el.scoring?.optionPoints?.[opt] ?? ''}
                      onChange={(e) => onPatch({ scoring: { ...(el.scoring ?? {}), optionPoints: { ...(el.scoring?.optionPoints ?? {}), [opt]: e.target.value === '' ? 0 : Number(e.target.value) } } })}
                    />
                  </div>
                ))
              ) : (
                <Prop label="Points for &lsquo;Yes&rsquo;">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={el.scoring?.optionPoints?.['yes'] ?? ''}
                    onChange={(e) => onPatch({ scoring: { ...(el.scoring ?? {}), optionPoints: { ...(el.scoring?.optionPoints ?? {}), yes: e.target.value === '' ? 0 : Number(e.target.value), no: 0 } } })}
                  />
                </Prop>
              )}
            </>
          ) : (
            <Prop label="Max points">
              <input className="input" type="number" min={0} value={el.scoring?.maxPoints ?? ''} onChange={(e) => onPatch({ scoring: e.target.value === '' ? undefined : { maxPoints: Number(e.target.value) } })} />
            </Prop>
          )}
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Multi-selection panel
// ---------------------------------------------------------------------------
function MultiSelectPanel({ count, onDuplicate, onDelete, hasCopiedStyle, onPasteStyle }: {
  count: number;
  onDuplicate: () => void;
  onDelete: () => void;
  hasCopiedStyle?: boolean;
  onPasteStyle?: () => void;
}) {
  return (
    <div className="bp-multi">
      <div className="bp-multi-header">
        <Icon name="layer-group" />
        <span>{count} fields selected</span>
      </div>
      <p className="bp-hint">Ctrl/Cmd+click or Shift+click to multi-select. Use Ctrl+D to duplicate, Del to delete.</p>
      <div className="bp-multi-actions">
        <Button size="sm" onClick={onDuplicate}><Icon name="copy" /> Duplicate</Button>
        <Button size="sm" variant="danger" onClick={onDelete}><Icon name="trash" /> Delete</Button>
        {hasCopiedStyle && onPasteStyle && (
          <Button size="sm" variant="ghost" onClick={onPasteStyle}><Icon name="paintbrush" /> Paste Style</Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main properties panel
// ---------------------------------------------------------------------------
export function PropertiesPanel({
  selectedKeys,
  elements,
  pageElements,
  activePage,
  pages,
  onPatch,
  onDelete,
  onDuplicate,
  onMove,
  onDeleteKeys,
  onDuplicateKeys,
  onRenamePage,
  branding,
  onBrandingChange,
  copiedStyle,
  onPasteStyleToSelected,
}: {
  selectedKeys: string[];
  elements: FormElement[];
  pageElements: FormElement[];
  activePage: string;
  pages: FormPage[];
  onPatch: (key: string, patch: Partial<FormElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onDeleteKeys: (keys: string[]) => void;
  onDuplicateKeys: (keys: string[]) => void;
  onRenamePage: (id: string, title: string) => void;
  branding: FormBranding | undefined;
  onBrandingChange: (b: FormBranding | undefined) => void;
  copiedStyle?: FieldStyle | null;
  onPasteStyleToSelected?: () => void;
}) {
  const [tab, setTab] = useState<PanelTab>('design');

  // Multi-selection
  if (selectedKeys.length > 1) {
    return (
      <div className="bp">
        <MultiSelectPanel
          count={selectedKeys.length}
          onDuplicate={() => onDuplicateKeys(selectedKeys)}
          onDelete={() => onDeleteKeys(selectedKeys)}
          hasCopiedStyle={Boolean(copiedStyle)}
          onPasteStyle={onPasteStyleToSelected}
        />
      </div>
    );
  }

  // Single selection
  if (selectedKeys.length === 1) {
    const el = elements.find((e) => e.key === selectedKeys[0]);
    if (!el) return null;
    const meta = FIELD_TYPE_MAP[el.type];
    const idx = pageElements.findIndex((e) => e.key === el.key);
    const canUp = idx > 0;
    const canDown = idx < pageElements.length - 1;

    return (
      <div className="bp">
        <div className="bp-field-header">
          <span className="bp-field-icon"><Icon name={meta?.icon ?? 'font'} /></span>
          <span className="bp-field-type">{meta?.label ?? el.type}</span>
          <div className="bp-field-actions">
            <button className="bp-action" disabled={!canUp} onClick={() => onMove(-1)} title="Move up" aria-label="Move up">
              <Icon name="arrow-up" />
            </button>
            <button className="bp-action" disabled={!canDown} onClick={() => onMove(1)} title="Move down" aria-label="Move down">
              <Icon name="arrow-down" />
            </button>
            <button className="bp-action" onClick={onDuplicate} title="Duplicate" aria-label="Duplicate">
              <Icon name="copy" />
            </button>
            <button className="bp-action bp-action-danger" onClick={onDelete} title="Delete" aria-label="Delete">
              <Icon name="trash" />
            </button>
          </div>
        </div>

        <TabSelector active={tab} onChange={setTab} />

        <div className="bp-tab-content">
          {tab === 'design' && <DesignTab el={el} fields={elements} onPatch={(p) => onPatch(el.key, p)} />}
          {tab === 'logic' && <LogicTab el={el} fields={elements} onPatch={(p) => onPatch(el.key, p)} />}
          {tab === 'advanced' && <AdvancedTab el={el} fields={elements} onPatch={(p) => onPatch(el.key, p)} />}
        </div>
      </div>
    );
  }

  // No selection — page & form settings
  const activePageObj = pages.find((p) => p.id === activePage);
  return (
    <div className="bp">
      <Section title="Page settings" icon="file-lines">
        <Prop label="Page title">
          <input
            className="input"
            value={activePageObj?.title ?? ''}
            onChange={(e) => onRenamePage(activePage, e.target.value)}
          />
        </Prop>
      </Section>

      <Section title="Branding" icon="palette" defaultOpen={false}>
        <Prop label="Primary color">
          <div className="bp-color-row">
            <input
              type="color"
              className="bp-color-picker"
              value={branding?.primaryColor ?? '#0047ab'}
              onChange={(e) => onBrandingChange({ ...(branding ?? {}), primaryColor: e.target.value })}
            />
            <input
              className="input mono"
              value={branding?.primaryColor ?? ''}
              onChange={(e) => onBrandingChange({ ...(branding ?? {}), primaryColor: e.target.value || undefined })}
              placeholder="#0047ab"
            />
          </div>
        </Prop>
        <Prop label="Thank-you title">
          <input
            className="input"
            value={branding?.thankYou?.title ?? ''}
            onChange={(e) => onBrandingChange({ ...(branding ?? {}), thankYou: { ...(branding?.thankYou ?? {}), title: e.target.value } })}
          />
        </Prop>
        <Prop label="Thank-you message">
          <textarea
            className="textarea"
            style={{ minHeight: 54 }}
            value={branding?.thankYou?.message ?? ''}
            onChange={(e) => onBrandingChange({ ...(branding ?? {}), thankYou: { ...(branding?.thankYou ?? {}), message: e.target.value } })}
          />
        </Prop>
      </Section>

      <Section title="Global Theme" icon="wand-magic-sparkles" defaultOpen={false}>
        <Prop label="Field radius">
          <input className="input" value={branding?.theme?.fieldRadius ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), fieldRadius: e.target.value || undefined } })} placeholder="6px" />
        </Prop>
        <Prop label="Field border">
          <input className="input" value={branding?.theme?.fieldBorder ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), fieldBorder: e.target.value || undefined } })} placeholder="1px solid #ccc" />
        </Prop>
        <Prop label="Field background">
          <input type="color" className="bp-color-picker" value={branding?.theme?.fieldBg ?? '#ffffff'} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), fieldBg: e.target.value } })} />
        </Prop>
        <div className="bp-row-pair">
          <Prop label="Label font">
            <select className="select" value={branding?.theme?.labelFont ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), labelFont: e.target.value || undefined } })}>
              <option value="">Default</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="Verdana, sans-serif">Verdana</option>
            </select>
          </Prop>
          <Prop label="Label size">
            <select className="select" value={branding?.theme?.labelSize ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), labelSize: e.target.value || undefined } })}>
              <option value="">Default</option>
              <option value="12px">12px</option>
              <option value="13px">13px</option>
              <option value="14px">14px</option>
            </select>
          </Prop>
        </div>
        <div className="bp-row-pair">
          <Prop label="Label weight">
            <select className="select" value={branding?.theme?.labelWeight ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), labelWeight: e.target.value || undefined } })}>
              <option value="">Default</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
            </select>
          </Prop>
          <Prop label="Label color">
            <input type="color" className="bp-color-picker" value={branding?.theme?.labelColor ?? '#1c2329'} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), labelColor: e.target.value } })} />
          </Prop>
        </div>
        <div className="bp-row-pair">
          <Prop label="Input size">
            <select className="select" value={branding?.theme?.inputSize ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), inputSize: e.target.value || undefined } })}>
              <option value="">Default</option>
              <option value="13px">13px</option>
              <option value="14px">14px</option>
              <option value="16px">16px</option>
            </select>
          </Prop>
          <Prop label="Input weight">
            <select className="select" value={branding?.theme?.inputWeight ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), inputWeight: e.target.value || undefined } })}>
              <option value="">Default</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
            </select>
          </Prop>
        </div>
        <div className="bp-row-pair">
          <Prop label="Input bg">
            <input type="color" className="bp-color-picker" value={branding?.theme?.inputBg ?? '#ffffff'} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), inputBg: e.target.value } })} />
          </Prop>
          <Prop label="Input border">
            <input className="input" value={branding?.theme?.inputBorder ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), inputBorder: e.target.value || undefined } })} placeholder="1px solid #ccc" />
          </Prop>
        </div>
        <div className="bp-row-pair">
          <Prop label="Input radius">
            <input className="input" value={branding?.theme?.inputRadius ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), inputRadius: e.target.value || undefined } })} placeholder="6px" />
          </Prop>
          <Prop label="Input padding">
            <input className="input" value={branding?.theme?.inputPadding ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), inputPadding: e.target.value || undefined } })} placeholder="8px 12px" />
          </Prop>
        </div>
        <Prop label="Focus border">
          <input type="color" className="bp-color-picker" value={branding?.theme?.focusBorder ?? '#0047ab'} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), focusBorder: e.target.value } })} />
        </Prop>
        <Prop label="Field gap">
          <input className="input" value={branding?.theme?.gap ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), gap: e.target.value || undefined } })} placeholder="16px" />
        </Prop>
        <Prop label="Content max width">
          <input className="input" value={branding?.theme?.contentMaxWidth ?? ''} onChange={(e) => onBrandingChange({ ...(branding ?? {}), theme: { ...(branding?.theme ?? {}), contentMaxWidth: e.target.value || undefined } })} placeholder="720px" />
        </Prop>
        <Prop label="Reset theme">
          <button className="btn btn-ghost btn-sm" onClick={() => onBrandingChange({ ...(branding ?? {}), theme: undefined })} type="button">
            <Icon name="rotate-left" /> Reset to defaults
          </button>
        </Prop>
      </Section>
    </div>
  );
}
