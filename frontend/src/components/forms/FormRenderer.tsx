'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Answers, FormBranding, FormElement, FormSchemaEnvelope, AppearanceConfig } from '@/lib/types';
import {
  computeCalculatedValues,
  computeFieldStates,
  simpleFieldError,
} from '@/lib/form-engine';
import { Button, Field } from '@/components/ui';
import { AiWritingAssist } from './AiWritingAssist';
import { SignaturePad } from './SignaturePad';
import { RichTextEditor } from './RichTextEditor';
import { sanitizeRichText } from '@/lib/form-engine';
import { toast } from '@/components/Toast';
import { groupIntoRows, getColumnTemplate } from './ColumnLayoutEngine';
import { resolveFieldStyles, resolveFormStyles } from './StyleEngine';

// ---------------------------------------------------------------------------
// FormRenderer: shared runtime for the respondent flow (respond page) and the
// builder's live preview. Envelope-aware: renders pages with a progress bar,
// applies display conditions + branching (same engine as the server), computes
// calculated fields, resolves prefills, and supports the new field types
// (location, matrix, richtext, calculated, prefill) plus consent + branding.
// The controlled `answers`/`setAnswers` props allow save&resume and editing.
// ---------------------------------------------------------------------------

const CONTROL_TYPES = new Set<string>([
  'shorttext', 'longtext', 'number', 'email', 'phone', 'date', 'time', 'datetime',
  'dropdown', 'multiplechoice', 'rating', 'yesno', 'file', 'image', 'signature',
  'slider', 'location', 'matrix', 'richtext',
]);

export function elementsOnPage(elements: FormElement[], pageId: string): FormElement[] {
  return elements.filter((e) => (e.pageId ?? 'page-1') === pageId);
}

export function FormRenderer({
  envelope,
  answers,
  setAnswers,
  files,
  branding: brandingProp,
  consent,
  setConsent,
  consentRequired,
  editable = true,
  allowDrafts = true,
  resumeToken,
  onResumeLinkGenerated,
  uploadFieldFile,
  templateId,
  userLabel,
  consentText,
  topSlot,
  bottomSlot,
  aiAssist,
}: {
  envelope: FormSchemaEnvelope;
  answers: Answers;
  setAnswers: (a: Answers) => void;
  files?: Record<string, Array<{ fileKey: string; originalName: string; sizeBytes: number; mimeType?: string }>>;
  branding?: FormBranding;
  consent?: boolean;
  setConsent?: (b: boolean) => void;
  consentRequired?: boolean;
  editable?: boolean;
  allowDrafts?: boolean;
  resumeToken?: string | null;
  onResumeLinkGenerated?: (token: string) => void;
  uploadFieldFile?: (el: FormElement, file: File) => Promise<void>;
  templateId?: number;
  userLabel?: { name?: string; email?: string } | null;
  consentText?: string | null;
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
  /** Enables the inline AI writing assistant on open-text answers. */
  aiAssist?: { mode: 'auth' | 'public' | 'edit' };
}): JSX.Element {
  const pages = envelope.pages?.length ? envelope.pages : [{ id: 'page-1', title: 'Page 1' }];
  const [pageIndex, setPageIndex] = useState(0);
  const [draftBusy, setDraftBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Callers may pass branding explicitly (builder preview) or only embed it in
  // the envelope (respondent/public pages) — fall back so appearance always renders.
  const branding = brandingProp ?? envelope.branding;

  // live computed values (calculated fields) merged into render + validation
  const live = useMemo(() => computeCalculatedValues(envelope.elements, answers), [envelope.elements, answers]);
  const states = useMemo(() => computeFieldStates(envelope.elements, live), [envelope.elements, live]);

  const sorted = [...envelope.elements].sort((a, b) => a.order - b.order);
  const allVisible = sorted.filter((el) => states[el.key]?.visible);
  const pageFields = elementsOnPage(allVisible, pages[Math.min(pageIndex, pages.length - 1)].id);

  // Split into flow vs positioned elements
  const flowFields = useMemo(() => pageFields.filter((e) => e.x == null || e.y == null), [pageFields]);
  const positionedFields = useMemo(() => pageFields.filter((e) => e.x != null && e.y != null), [pageFields]);

  // Row-based layout for flow elements
  const rows = useMemo(() => groupIntoRows(flowFields, 12), [flowFields]);
  const formStyles = useMemo(() => resolveFormStyles(branding?.theme), [branding?.theme]);

  function setAnswer(key: string, value: unknown) {
    setAnswers({ ...answers, [key]: value });
  }

  function validatePage(fields: FormElement[]): string | null {
    for (const el of fields) {
      if (el.type === 'calculated' || el.type === 'prefill') continue;
      if (el.type === 'section' || el.type === 'instructions') continue;
      if (['heading', 'content-image', 'divider', 'spacer', 'button', 'quote', 'container', 'richtext'].includes(el.type)) continue;
      const err = simpleFieldError(el, live[el.key], states[el.key].required);
      if (err) return `"${el.label}": ${err}`;
    }
    return null;
  }

  function next() {
    const err = validatePage(pageFields);
    if (err) return alert(err);
    if (pageIndex < pages.length - 1) setPageIndex(pageIndex + 1);
  }

  async function saveDraftLocal() {
    if (!allowDrafts || draftBusy) return;
    setDraftBusy(true);
    try {
      const body: Record<string, unknown> = {
        answers: Object.fromEntries(Object.entries(live).filter(([, v]) => v !== undefined && v !== null && v !== '')),
      };
      if (resumeToken) body.resumeToken = resumeToken;
      const res = await (await fetch(`${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '')}/forms/${templateId ?? 0}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('kgmis_token')}` },
        body: JSON.stringify(body),
      })).json();
      onResumeLinkGenerated?.(res.resumeToken);
      toast.success('Draft saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setDraftBusy(false);
    }
  }

  const colors = branding?.primaryColor ? { '--primary': branding.primaryColor } as React.CSSProperties : undefined;

  // Appearance config helpers
  const appearanceConfig = branding?.appearanceConfig as AppearanceConfig | undefined;

  // Header/Banner
  const headerConfig = appearanceConfig?.header;
  const showHeader = headerConfig?.enabled && headerConfig?.imageUrl;

  // Watermark
  const watermarkConfig = appearanceConfig?.watermark;
  const watermarkStyle = useMemo(() => {
    const wc = watermarkConfig;
    if (!wc?.enabled) return {};

    let bgImage: string | undefined;
    if (wc.type === 'image' && wc.imageUrl) {
      bgImage = `url(${wc.imageUrl})`;
    } else if (wc.type === 'text' && wc.text) {
      // Resolve placeholders in watermark text
      const resolvedText = wc.text
        .replace(/\{\{responseId\}\}/g, 'PREVIEW-123')
        .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
        .replace(/\{\{time\}\}/g, new Date().toLocaleTimeString())
        .replace(/\{\{datetime\}\}/g, new Date().toLocaleString());

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
                font-size="28" fill="rgba(0,0,0,${wc.opacity ?? 0.1})"
                transform="rotate(${wc.rotation ?? -45}, 150, 150)">
            ${resolvedText}
          </text>
        </svg>
      `;
      bgImage = `url("data:image/svg+xml,${encodeURIComponent(svg.trim())}")`;
    }

    if (!bgImage) return {};

    return {
      backgroundImage: bgImage,
      backgroundSize: `${wc.size ?? 100}%`,
      backgroundPosition: wc.position === 'repeat' ? 'center' : wc.position?.replace('-', ' ') || 'center',
      backgroundRepeat: wc.position === 'repeat' ? 'repeat' : 'no-repeat',
    };
  }, [watermarkConfig]);

  // Body Background
  const bodyBgStyle = useMemo(() => {
    const bg = appearanceConfig?.bodyBackground;
    if (!bg || bg.type === 'default') return {};

    if (bg.type === 'solid' && bg.color) {
      return { backgroundColor: bg.color };
    }
    if (bg.type === 'gradient' && bg.gradientStart && bg.gradientEnd) {
      return {
        background: `linear-gradient(${bg.gradientDirection ?? 135}deg, ${bg.gradientStart}, ${bg.gradientEnd})`
      };
    }
    return {};
  }, [appearanceConfig?.bodyBackground]);

  // Footer
  const footerConfig = appearanceConfig?.footer;

  return (
    <div className="form-layout" style={{ ...colors, ...formStyles, ...watermarkStyle, ...bodyBgStyle }}>
      <div className="form-layout__inner">
        {branding?.logoUrl ? (
          <div style={{ textAlign: 'center', padding: '0 0 8px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoUrl} alt="logo" style={{ maxHeight: 60 }} />
          </div>
        ) : null}

        {showHeader && (
          <div
            className="form-layout__header"
            style={{
              height: {
                small: 80,
                medium: 160,
                large: 240,
              }[headerConfig?.height ?? 'medium'],
            }}
            aria-hidden="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={headerConfig?.imageUrl}
              alt=""
              style={{
                objectFit: headerConfig?.fit ?? 'cover',
                objectPosition: {
                  left: 'left center',
                  center: 'center',
                  right: 'right center',
                }[headerConfig?.position ?? 'center'],
              }}
            />
          </div>
        )}

        {topSlot}

        <div className="card" style={{ marginBottom: 16, padding: '8px 18px', background: 'var(--primary-soft)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 600 }}>{pages[Math.min(pageIndex, pages.length - 1)].title}</div>
          <div className="hint">
            Page {pageIndex + 1} of {pages.length}
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--border-strong)', marginTop: 6, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${((pageIndex + 1) / pages.length) * 100}%`,
              background: branding?.primaryColor ?? 'var(--primary)',
              transition: 'width .25s',
            }}
          />
        </div>
      </div>

      {rows.map((row) => {
        const isMultiCol = row.elements.length > 1;
        return (
          <div
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: isMultiCol ? getColumnTemplate(row) : undefined,
              gap: isMultiCol ? `${row.gap}px` : undefined,
              marginBottom: 'var(--form-gap, 12px)',
            }}
          >
            {row.elements.map((el) => {
              const st = states[el.key];
              const styles = resolveFieldStyles(el, branding?.theme);
              if (el.type === 'section') {
                return (
                  <div key={el.key} className="card" style={{ ...styles.wrapper, marginBottom: 16, background: 'var(--form-section-bg, var(--surface-2))', border: 'none', borderRadius: branding?.theme?.sectionRadius ?? undefined }}>
                    <h3 style={{ margin: 0, padding: '12px 18px', ...styles.label }}>{el.label}</h3>
                  </div>
                );
              }
              if (el.type === 'instructions') {
                return (
                  <div key={el.key} className="card" style={{ ...styles.wrapper, marginBottom: 16, padding: '14px 18px' }}>
                    <div style={styles.label}>{el.label}</div>
                    {el.description ? <div className="hint" style={styles.description}>{el.description}</div> : null}
                  </div>
                );
              }
              if (el.type === 'calculated' || el.type === 'prefill') {
                const computed = el.type === 'calculated' ? live[el.key] : resolvePrefill(el, userLabel);
                return (
                  <div key={el.key} className="card" style={{ ...styles.wrapper, marginBottom: 12, padding: '16px 18px', background: 'var(--surface-2)' }}>
                    <div className="label" style={{ fontSize: 12, ...styles.label }}>{el.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, ...styles.input }}>{computed === null || computed === undefined || computed === '' ? '—' : String(computed)}</div>
                    {el.description ? <div className="hint" style={styles.description}>{el.description}</div> : null}
                  </div>
                );
              }
              if (el.type === 'heading') {
                const Tag = `h${el.headingLevel ?? 2}` as keyof JSX.IntrinsicElements;
                return <Tag key={el.key} style={{ margin: '16px 0 8px', ...styles.label }}>{el.label}</Tag>;
              }
              if (el.type === 'content-image') {
                return el.imageUrl ? (
                  <div key={el.key} style={{ ...styles.wrapper, marginBottom: 12, textAlign: 'center' }}>
                    <img src={el.imageUrl} alt={el.imageAlt || ''} style={{ maxWidth: el.imageWidth || '100%', maxHeight: 400, objectFit: el.imageFit || 'cover', borderRadius: el.imageBorderRadius ?? 8 }} />
                    {el.imageCaption ? <div className="hint" style={{ marginTop: 4, ...styles.description }}>{el.imageCaption}</div> : null}
                  </div>
                ) : null;
              }
              if (el.type === 'divider') {
                return <hr key={el.key} style={{ ...styles.wrapper, border: 'none', borderTop: `2px ${el.dividerStyle || 'solid'} ${el.dividerColor || '#e0e0e0'}`, margin: '16px 0' }} />;
              }
              if (el.type === 'spacer') {
                return <div key={el.key} style={{ height: el.spacerHeight ?? 40 }} />;
              }
              if (el.type === 'button') {
                return (
                  <div key={el.key} style={{ ...styles.wrapper, marginBottom: 12, textAlign: 'center' }}>
                    {el.buttonUrl ? (
                      <a href={el.buttonUrl} target="_blank" rel="noopener noreferrer" className={`btn btn-${el.buttonVariant || 'primary'}`}>
                        {el.buttonLabel || 'Button'}
                      </a>
                    ) : (
                      <button className={`btn btn-${el.buttonVariant || 'primary'}`}>{el.buttonLabel || 'Button'}</button>
                    )}
                  </div>
                );
              }
              if (el.type === 'quote') {
                return (
                  <blockquote key={el.key} style={{ ...styles.wrapper, margin: '12px 0', padding: '12px 20px', borderLeft: '4px solid var(--primary, #0047ab)', background: 'var(--surface-2, #f8f9fa)', borderRadius: 4 }}>
                    <p style={{ margin: 0, fontStyle: 'italic', ...styles.input }}>&ldquo;{el.quoteContent || 'Quote text…'}&rdquo;</p>
                    {el.quoteAuthor ? <cite style={{ display: 'block', marginTop: 6, fontSize: 13 }}>— {el.quoteAuthor}</cite> : null}
                  </blockquote>
                );
              }
              if (el.type === 'richtext') {
                return <div key={el.key} style={{ ...styles.wrapper, marginBottom: 12 }} dangerouslySetInnerHTML={{ __html: sanitizeRichText(el.contentHtml || el.label) }} />;
              }
              if (el.type === 'container') {
                const children = allVisible.filter(c => c.containerKey === el.key);
                return (
                  <div key={el.key} className="card" style={{
                    ...styles.wrapper,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${el.containerLayout?.columns ?? 1}, 1fr)`,
                    gap: el.containerLayout?.gap ?? 12,
                    background: el.containerLayout?.background,
                    border: el.containerLayout?.border ?? '1px solid var(--border)',
                    borderColor: el.containerLayout?.borderColor,
                    borderRadius: el.containerLayout?.borderRadius,
                    padding: el.containerLayout?.padding ?? '16px',
                    marginBottom: styles.wrapper.margin ? undefined : 12,
                  }}>
                    {children.length === 0 ? (
                      <div className="hint" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 20 }}>
                        Empty container
                      </div>
                    ) : (
                      children.map(child => {
                        const childSt = states[child.key];
                        const childStyles = resolveFieldStyles(child, branding?.theme);
                        if (child.type === 'section') {
                          return (
                            <div key={child.key} className="card" style={{ ...childStyles.wrapper, background: 'var(--form-section-bg, var(--surface-2))', border: 'none', borderRadius: branding?.theme?.sectionRadius ?? undefined }}>
                              <h3 style={{ margin: 0, padding: '12px 18px', ...childStyles.label }}>{child.label}</h3>
                            </div>
                          );
                        }
                        if (child.type === 'heading') {
                          const Tag = `h${child.headingLevel ?? 2}` as keyof JSX.IntrinsicElements;
                          return <Tag key={child.key} style={{ margin: '16px 0 8px', ...childStyles.label }}>{child.label}</Tag>;
                        }
                        if (child.type === 'divider') {
                          return <hr key={child.key} style={{ border: 'none', borderTop: `2px ${child.dividerStyle || 'solid'} ${child.dividerColor || '#e0e0e0'}`, margin: '16px 0' }} />;
                        }
                        if (child.type === 'spacer') {
                          return <div key={child.key} style={{ height: child.spacerHeight ?? 40 }} />;
                        }
                        return (
                          <div key={child.key} className="card" style={{ ...childStyles.wrapper, marginBottom: childStyles.wrapper.margin ? undefined : 12 }}>
                            <Field
                              label={child.label}
                              required={childSt.required}
                              hint={child.description}
                              labelStyle={childStyles.label}
                              hintStyle={childStyles.description}
                              containerStyle={{ marginBottom: 0 }}
                            >
                              <Control el={child} value={live[child.key]} onChange={editable ? (v) => setAnswer(child.key, v) : undefined} assist={aiAssist?.mode} />
                            </Field>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              }
              if (el.type === 'signature') {
                const sigValue = live[el.key];
                return (
                  <div key={el.key} className="card" style={{ ...styles.wrapper, marginBottom: 12, padding: '16px 18px' }}>
                    <Field label={el.label} required={st.required} hint={el.description}>
                      {editable ? (
                        <SignaturePad
                          value={String(sigValue ?? '')}
                          onChange={(dataUrl) => setAnswer(el.key, dataUrl)}
                          height={el.signatureHeight ?? 200}
                          penColor={el.penColor ?? '#000000'}
                          penWidth={el.penWidth ?? 2}
                        />
                      ) : (
                        <div className="hint">{sigValue ? 'Signature captured' : 'No signature'}</div>
                      )}
                    </Field>
                  </div>
                );
              }
              if (el.type === 'file' || el.type === 'image') {
                return (
                  <div key={el.key} className="card" style={{ ...styles.wrapper, marginBottom: 12, padding: '16px 18px' }}>
                    <Field label={el.label} required={st.required} hint={el.description}>
                      {editable ? (
                        <>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={el.fileAllowedTypes?.join(',')}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f && uploadFieldFile) void uploadFieldFile(el, f);
                            }}
                          />
                          {(files?.[el.key] ?? []).length ? (
                            <div className="hint">Uploaded: {(files?.[el.key] ?? []).map((x) => x.originalName).join(', ')}</div>
                          ) : null}
                        </>
                      ) : (
                        <div className="hint">{(files?.[el.key] ?? []).map((x) => x.originalName).join(', ') || 'No file attached'}</div>
                      )}
                    </Field>
                  </div>
                );
              }
              return (
                <div key={el.key} className="card" style={{ ...styles.wrapper, marginBottom: styles.wrapper.margin ? undefined : 12, padding: styles.wrapper.padding ? undefined : '16px 18px' }}>
                  <Field
                    label={el.label}
                    required={st.required}
                    hint={el.description}
                    labelStyle={styles.label}
                    hintStyle={styles.description}
                    containerStyle={{ marginBottom: 0 }}
                  >
                    <Control
                      el={el}
                      value={live[el.key]}
                      onChange={editable ? (v) => setAnswer(el.key, v) : undefined}
                      assist={aiAssist?.mode}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Positioned elements (absolute overlay within the content column) */}
      {positionedFields.length > 0 && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
          {positionedFields.map((el) => {
            const st = states[el.key];
            const styles = resolveFieldStyles(el, branding?.theme);
            const baseStyle: React.CSSProperties = {
              position: 'absolute',
              left: el.x ?? 0,
              top: el.y ?? 0,
              width: el.posWidth ?? 280,
              pointerEvents: 'auto',
              ...styles.wrapper,
            };
            if (el.type === 'section') {
              return (
                <div key={el.key} className="card" style={{ ...baseStyle, background: 'var(--form-section-bg, var(--surface-2))', border: 'none', borderRadius: branding?.theme?.sectionRadius ?? undefined }}>
                  <h3 style={{ margin: 0, padding: '12px 18px', ...styles.label }}>{el.label}</h3>
                </div>
              );
            }
            if (el.type === 'heading') {
              const Tag = `h${el.headingLevel ?? 2}` as keyof JSX.IntrinsicElements;
              return <Tag key={el.key} style={{ ...baseStyle, margin: '16px 0 8px', ...styles.label }}>{el.label}</Tag>;
            }
            if (el.type === 'content-image') {
              return el.imageUrl ? (
                <div key={el.key} style={{ ...baseStyle, textAlign: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={el.imageUrl} alt={el.imageAlt || ''} style={{ maxWidth: '100%', maxHeight: 400, objectFit: el.imageFit || 'cover', borderRadius: el.imageBorderRadius ?? 8 }} />
                </div>
              ) : null;
            }
            if (el.type === 'divider') {
              return <hr key={el.key} style={{ ...baseStyle, border: 'none', borderTop: `2px ${el.dividerStyle || 'solid'} ${el.dividerColor || '#e0e0e0'}`, margin: '16px 0' }} />;
            }
            if (el.type === 'spacer') {
              return <div key={el.key} style={{ ...baseStyle, height: el.spacerHeight ?? 40 }} />;
            }
            // Default: render as a card with field control
            return (
              <div key={el.key} className="card" style={{ ...baseStyle, padding: styles.wrapper.padding ?? '16px 18px' }}>
                <Field
                  label={el.label}
                  required={st.required}
                  hint={el.description}
                  labelStyle={styles.label}
                  hintStyle={styles.description}
                  containerStyle={{ marginBottom: 0 }}
                >
                  <Control el={el} value={live[el.key]} onChange={editable ? (v) => setAnswer(el.key, v) : undefined} assist={aiAssist?.mode} />
                </Field>
              </div>
            );
          })}
        </div>
      )}

      {consentRequired ? (
        <div className="card" style={{ position: 'relative', zIndex: 10, marginBottom: 12, padding: '14px 18px' }}>
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(consent)} onChange={(e) => setConsent?.(e.target.checked)} />
            {consentText ?? 'I consent to my data being processed for market intelligence purposes.'}
          </label>
        </div>
      ) : null}

{editable && pages.length > 1 ? (
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <Button variant="ghost" disabled={pageIndex === 0} onClick={() => setPageIndex((p) => Math.max(0, p - 1))}>
            Previous
          </Button>
          {onResumeLinkGenerated && allowDrafts ? (
            <Button variant="ghost" size="sm" disabled={draftBusy} onClick={() => void saveDraftLocal()}>
              {draftBusy ? 'Saving…' : 'Save & resume later'}
            </Button>
          ) : null}
          <Button onClick={next} disabled={pageIndex === pages.length - 1}>
            Next
          </Button>
        </div>
      ) : null}

      {bottomSlot}

      {footerConfig?.enabled && (
        <footer
          className="form-layout__footer"
          style={{
            backgroundColor: footerConfig?.backgroundColor ?? undefined,
            color: footerConfig?.textColor ?? undefined,
            textAlign: footerConfig?.textAlign ?? 'center',
          }}
        >
          {footerConfig?.logoUrl && (
            <div style={{ marginBottom: 8, textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={footerConfig.logoUrl} alt="" style={{ maxHeight: 40 }} />
            </div>
          )}
          {footerConfig?.text && (
            <div style={{ marginBottom: 8 }}>{footerConfig.text}</div>
          )}
          {footerConfig?.copyrightText && (
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {footerConfig.copyrightText}
            </div>
          )}
          {footerConfig?.showPoweredBy !== false && (
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>
              Powered by KG-MIS
            </div>
          )}
        </footer>
      )}
      </div>
    </div>
  );
}

function resolvePrefill(el: FormElement, user?: { name?: string; email?: string } | null): string | null {
  if (el.prefillSource === 'name') return user?.name ?? null;
  if (el.prefillSource === 'email') return user?.email ?? null;
  return el.prefillValue ?? null;
}

function Control({
  el,
  value,
  onChange,
  assist,
}: {
  el: FormElement;
  value: unknown;
  onChange?: (v: unknown) => void;
  assist?: 'auth' | 'public' | 'edit';
}) {
  const common = { className: 'input' };
  const readOnly = !onChange;
  const onChangeSafe = onChange ?? (() => undefined);

  if (readOnly) {
    if (el.type === 'multiplechoice') {
      const arr = (Array.isArray(value) ? value : value ? [String(value)] : []) as string[];
      return <div className="hint">{arr.join(', ') || '—'}</div>;
    }
    if (el.type === 'matrix') return <MatrixReadOnly el={el} value={value} />;
    if (el.type === 'location') {
      const loc = value as { lat?: number; lng?: number; address?: string } | undefined;
      return <div className="hint">{loc?.address ?? (loc ? `${loc.lat?.toFixed(5)}, ${loc.lng?.toFixed(5)}` : '—')}</div>;
    }
    if (el.type === 'richtext') {
      return <div className="hint rich-text" dangerouslySetInnerHTML={{ __html: sanitizeRichText(String(value ?? '')) }} />;
    }
    return <div className="hint">{Array.isArray(value) ? (value as unknown[]).join(', ') : String(value ?? '—')}</div>;
  }

  switch (el.type) {
    case 'shorttext':
      return (
        <>
          <input {...common} value={String(value ?? '')} maxLength={el.maxLength} onChange={(e) => onChangeSafe(e.target.value)} placeholder={el.placeholder} />
          {assist && (
            <AiWritingAssist
              label={el.label}
              {...(el.description ? { description: el.description } : {})}
              type={el.type}
              {...(el.maxLength !== undefined ? { maxLength: el.maxLength } : {})}
              value={String(value ?? '')}
              onChange={(v) => onChangeSafe(v)}
              mode={assist}
            />
          )}
        </>
      );
    case 'longtext':
      return (
        <>
          <textarea className="textarea" value={String(value ?? '')} maxLength={el.maxLength} onChange={(e) => onChangeSafe(e.target.value)} placeholder={el.placeholder} />
          {assist && (
            <AiWritingAssist
              label={el.label}
              {...(el.description ? { description: el.description } : {})}
              type={el.type}
              {...(el.maxLength !== undefined ? { maxLength: el.maxLength } : {})}
              value={String(value ?? '')}
              onChange={(v) => onChangeSafe(v)}
              mode={assist}
            />
          )}
        </>
      );
    case 'number':
      return <input {...common} type="number" value={String(value ?? '')} min={el.min} max={el.max} onChange={(e) => onChangeSafe(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'email':
      return <input {...common} type="email" value={String(value ?? '')} onChange={(e) => onChangeSafe(e.target.value)} />;
    case 'phone':
      return <input {...common} type="tel" value={String(value ?? '')} onChange={(e) => onChangeSafe(e.target.value)} />;
    case 'date':
      return <input {...common} type="date" value={String(value ?? '')} onChange={(e) => onChangeSafe(e.target.value)} />;
    case 'time':
      return <input {...common} type="time" value={String(value ?? '')} onChange={(e) => onChangeSafe(e.target.value)} />;
    case 'datetime':
      return <input {...common} type="datetime-local" value={String(value ?? '')} onChange={(e) => onChangeSafe(e.target.value)} />;
    case 'dropdown':
      return (
        <select className="select" value={String(value ?? '')} onChange={(e) => onChangeSafe(e.target.value)}>
          <option value="">— select —</option>
          {(el.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'multiplechoice':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(el.options ?? []).map((o) => {
            const arr = (Array.isArray(value) ? value : value ? [String(value)] : []) as string[];
            return (
              <label className="checkbox-row" key={o}>
                <input
                  type="checkbox"
                  checked={arr.includes(o)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...arr, o] : arr.filter((x) => x !== o);
                    onChangeSafe(next);
                  }}
                />
                {o}
              </label>
            );
          })}
        </div>
      );
    case 'rating':
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: Math.max(1, el.max ?? 5) }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChangeSafe(n)}
              style={{
                fontSize: 20, border: 'none', background: 'none', cursor: 'pointer',
                color: Number(value) >= n ? 'var(--accent)' : 'var(--border-strong)',
              }}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
            >
              <i className={`fa-${Number(value) >= n ? 'solid' : 'regular'} fa-star`} />
            </button>
          ))}
        </div>
      );
    case 'yesno':
      return (
        <div style={{ display: 'flex', gap: 10 }}>
          {['yes', 'no'].map((opt) => (
            <label className="checkbox-row" key={opt}>
              <input type="radio" name={el.key} checked={value === opt} onChange={() => onChangeSafe(opt)} />
              {opt}
            </label>
          ))}
        </div>
      );
    case 'slider':
      return (
        <div>
          <input
            type="range"
            min={el.min ?? 0}
            max={el.max ?? 100}
            value={Number(value ?? el.min ?? 0)}
            onChange={(e) => onChangeSafe(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div className="hint" style={{ textAlign: 'right' }}>{String(value ?? '')}</div>
        </div>
      );
    case 'location': {
      const loc = (value ?? {}) as { lat?: number; lng?: number; address?: string };
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="form-row">
            <input
              className="input"
              type="number"
              placeholder="Latitude"
              value={loc.lat ?? ''}
              onChange={(e) => onChangeSafe({ ...loc, lat: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
            <input
              className="input"
              type="number"
              placeholder="Longitude"
              value={loc.lng ?? ''}
              onChange={(e) => onChangeSafe({ ...loc, lng: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </div>
          <input
            className="input"
            placeholder="Address (optional)"
            value={loc.address ?? ''}
            onChange={(e) => onChangeSafe({ ...loc, address: e.target.value })}
          />
          <div className="hint">
            {typeof navigator !== 'undefined' && 'geolocation' in navigator ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigator.geolocation.getCurrentPosition(
                    (pos) =>
                      onChangeSafe({
                        ...loc,
                        lat: Number(pos.coords.latitude.toFixed(6)),
                        lng: Number(pos.coords.longitude.toFixed(6)),
                      }),
                    () => undefined
                  )
                }
              >
                Use my current location
              </Button>
            ) : null}
          </div>
        </div>
      );
    }
    case 'matrix': {
      const obj = (value ?? {}) as Record<string, unknown>;
      const setCell = (row: string, col: string, checked: boolean) => {
        const cur = obj[row];
        if (el.matrixScale === 'multi') {
          const arr = Array.isArray(cur) ? (cur as string[]) : cur ? [String(cur)] : [];
          const next = checked ? [...arr, col] : arr.filter((x) => x !== col);
          onChangeSafe({ ...obj, [row]: next });
        } else {
          onChangeSafe({ ...obj, [row]: checked ? col : undefined });
        }
      };
      return (
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th></th>
              {(el.matrixColumns ?? []).map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {(el.matrixRows ?? []).map((row) => {
              const cur = obj[row];
              return (
                <tr key={row}>
                  <td style={{ fontWeight: 600 }}>{row}</td>
                  {(el.matrixColumns ?? []).map((col) => {
                    const checked = el.matrixScale === 'multi'
                      ? (Array.isArray(cur) ? (cur as string[]).includes(col) : cur === col)
                      : cur === col;
                    return (
                      <td key={col}>
                        <input
                          type="checkbox"
                          checked={Boolean(checked)}
                          onChange={(e) => setCell(row, col, e.target.checked)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }
    case 'richtext':
      return (
        <RichTextEditor
          value={String(value ?? '')}
          onChange={(html) => onChangeSafe(html)}
          placeholder="Start typing…"
          minHeight={140}
        />
      );
    default:
      return null;
  }
}

function MatrixReadOnly({ el, value }: { el: FormElement; value: unknown }) {
  const obj = (value ?? {}) as Record<string, unknown>;
  return (
    <table className="table" style={{ width: '100%' }}>
      <thead>
        <tr>
          <th></th>
          {(el.matrixColumns ?? []).map((c) => <th key={c}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {(el.matrixRows ?? []).map((row) => {
          const cur = obj[row];
          const arr = Array.isArray(cur) ? (cur as string[]) : cur ? [String(cur)] : [];
          return (
            <tr key={row}>
              <td style={{ fontWeight: 600 }}>{row}</td>
              {(el.matrixColumns ?? []).map((col) => (
                <td key={col}>{arr.includes(col) ? '✓' : ''}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}