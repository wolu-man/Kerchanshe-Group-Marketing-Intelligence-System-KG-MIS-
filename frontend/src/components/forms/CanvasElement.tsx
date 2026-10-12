'use client';

import { memo, useRef, useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui';
import type { FormElement } from '@/lib/types';
import { sanitizeRichText } from '@/lib/form-engine';
import { FIELD_TYPE_MAP } from './FormBuilderState';
import { resolveFieldStyles } from './StyleEngine';
import { ElementResizeHandles } from './ElementResizeHandles';
import { ImageCropModal } from './ImageCropModal';

// ---------------------------------------------------------------------------
// Inline editable text (click-to-edit on the canvas)
// ---------------------------------------------------------------------------
function InlineText({ value, onCommit, placeholder, className = '' }: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { ref.current?.focus(); ref.current?.select(); }
  }, [editing]);

  if (!editing) {
    return (
      <span
        className={`bcv-inline ${value ? '' : 'placeholder'} ${className}`}
        title="Click to edit"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      >
        {value || placeholder || 'Click to edit'}
      </span>
    );
  }

  return (
    <input
      ref={ref}
      className="input bcv-inline-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ---------------------------------------------------------------------------
// Static field mockup for the canvas
// ---------------------------------------------------------------------------
function FieldMockup({ el, inputStyle }: { el: FormElement; inputStyle?: React.CSSProperties }) {
  const s = inputStyle ?? {};
  switch (el.type) {
    case 'shorttext':
    case 'email':
    case 'phone':
    case 'number':
    case 'date':
    case 'time':
    case 'datetime':
      return <div className="bcv-mock-input" style={s}>{el.placeholder || 'Answer…'}</div>;
    case 'longtext':
      return <div className="bcv-mock-input bcv-mock-tall" style={s}>{el.placeholder || 'Answer…'}</div>;
    case 'dropdown':
      return (
        <div className="bcv-mock-input bcv-mock-dropdown" style={s}>
          <span>{el.options?.[0] || '— select —'}</span>
          <Icon name="chevron-down" />
        </div>
      );
    case 'multiplechoice':
      return (
        <div className="bcv-mock-choices">
          {(el.options ?? []).slice(0, 4).map((o) => (
            <div key={o} className="bcv-mock-choice">
              <Icon name="square" type="regular" /> {o}
            </div>
          ))}
          {(el.options ?? []).length > 4 && <div className="bcv-mock-more">+{el.options!.length - 4} more</div>}
        </div>
      );
    case 'yesno':
      return (
        <div className="bcv-mock-pills">
          {['Yes', 'No'].map((o) => <span key={o} className="bcv-mock-pill">{o}</span>)}
        </div>
      );
    case 'rating':
      return (
        <div className="bcv-mock-stars">
          {Array.from({ length: Math.max(1, el.max ?? 5) }, (_, i) => (
            <Icon key={i} name="star" />
          ))}
        </div>
      );
    case 'slider':
      return (
        <div className="bcv-mock-slider">
          <div className="bcv-mock-track" />
          <div className="bcv-mock-slider-labels">
            <span>{el.min ?? 0}</span>
            <span>{el.max ?? 100}</span>
          </div>
        </div>
      );
    case 'matrix': {
      const cols = el.matrixColumns ?? [];
      return (
        <div className="bcv-mock-matrix">
          <div className="bcv-mock-matrix-header">
            <div className="bcv-mock-matrix-corner" />
            {cols.map((c) => <div key={c} className="bcv-mock-matrix-col">{c}</div>)}
          </div>
          {(el.matrixRows ?? []).map((r) => (
            <div key={r} className="bcv-mock-matrix-row">
              <div className="bcv-mock-matrix-label">{r}</div>
              {cols.map((c) => <div key={c} className="bcv-mock-matrix-cell" />)}
            </div>
          ))}
        </div>
      );
    }
    case 'file':
    case 'image':
    case 'signature':
      return (
        <div className="bcv-mock-upload">
          <Icon name={el.type === 'image' ? 'image' : el.type === 'signature' ? 'pen-nib' : 'paperclip'} />
          <span>Drop or click to upload</span>
        </div>
      );
    case 'location':
      return (
        <div className="bcv-mock-location">
          <div className="bcv-mock-location-row">
            <div className="bcv-mock-input">Latitude</div>
            <div className="bcv-mock-input">Longitude</div>
          </div>
          <div className="bcv-mock-input">Address (optional)</div>
        </div>
      );
    case 'calculated':
    case 'prefill':
      return <div className="bcv-mock-computed">—</div>;
    case 'heading': {
      const Level = `h${el.headingLevel ?? 2}` as keyof JSX.IntrinsicElements;
      return <Level className="bcv-mock-heading" style={{ margin: 0 }}>{el.label || 'Heading'}</Level>;
    }
    case 'richtext':
      return (
        <div
          className="bcv-mock-richtext"
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(el.contentHtml || '<p>Rich text…</p>') }}
        />
      );
    case 'content-image':
      if (!el.imageUrl) {
        return <div className="bcv-mock-upload"><Icon name="image" /><span>No image</span></div>;
      }
      if (el.imageCrop) {
        return (
          <div style={{ overflow: 'hidden', borderRadius: 6, maxHeight: 140 }}>
            <img
              src={el.imageUrl}
              alt={el.imageAlt || ''}
              style={{
                width: `${100 / (el.imageCrop.w / 100)}%`,
                height: `${100 / (el.imageCrop.h / 100)}%`,
                objectFit: el.imageFit || 'cover',
                marginLeft: `-${el.imageCrop.x}%`,
                marginTop: `-${el.imageCrop.y}%`,
                display: 'block',
              }}
            />
          </div>
        );
      }
      return (
        <img src={el.imageUrl} alt={el.imageAlt || ''} style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 6, objectFit: el.imageFit || 'cover' }} />
      );
    case 'divider':
      return (
        <hr
          className="bcv-mock-divider"
          style={{
            border: 'none',
            borderTop: `2px ${el.dividerStyle || 'solid'} ${el.dividerColor || '#e0e0e0'}`,
            margin: '8px 0',
          }}
        />
      );
    case 'spacer':
      return (
        <div
          className="bcv-mock-spacer"
          style={{ height: el.spacerHeight ?? 40, background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, #f0f0f0 4px, #f0f0f0 8px)', borderRadius: 4, opacity: 0.5 }}
        />
      );
    case 'button':
      return (
        <div className={`bcv-mock-btn bcv-mock-btn-${el.buttonVariant || 'primary'}`}>
          {el.buttonLabel || 'Button'}
        </div>
      );
    case 'quote':
      return (
        <div className="bcv-mock-quote">
          <p>&ldquo;{el.quoteContent || 'Quote text…'}&rdquo;</p>
          {el.quoteAuthor && <cite>— {el.quoteAuthor}</cite>}
        </div>
      );
    case 'container':
      return (
        <div className="bcv-mock-container">
          <Icon name="box" /> Container
        </div>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Canvas element card
// ---------------------------------------------------------------------------
export const CanvasElement = memo(function CanvasElement({
  el,
  selected,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
  onFreeDragStart,
  onFreeDragMove,
  onFreeDragEnd,
  snapToGrid,
  gridSize,
}: {
  el: FormElement;
  selected: boolean;
  onSelect: (e: React.MouseEvent<HTMLElement>) => void;
  onPatch: (key: string, patch: Partial<FormElement>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFreeDragStart?: (key: string, x: number, y: number) => void;
  onFreeDragMove?: (key: string, x: number, y: number) => void;
  onFreeDragEnd?: (key: string, x: number, y: number) => void;
  snapToGrid?: boolean;
  gridSize?: number;
}) {
  const resolved = resolveFieldStyles(el);
  const elRef = useRef<HTMLDivElement>(null);
  const [showCrop, setShowCrop] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const meta = FIELD_TYPE_MAP[el.type];
  const isLayout = el.type === 'section' || el.type === 'instructions' || el.type === 'heading' || el.type === 'divider' || el.type === 'spacer' || el.type === 'quote' || el.type === 'container';
  const isDesign = el.type === 'content-image' || el.type === 'button' || el.type === 'richtext';
  const canCrop = el.type === 'content-image' && el.imageUrl;
  const isPositioned = el.x != null && el.y != null;

  // --- Free drag via pointer events on the handle ---
  const snapValue = useCallback((v: number) => {
    if (!snapToGrid || !gridSize) return v;
    return Math.round(v / gridSize) * gridSize;
  }, [snapToGrid, gridSize]);

  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Use stored x/y for positioned elements, or compute from offsetLeft/offsetTop for flow elements
    let origX: number;
    let origY: number;
    if (el.x != null && el.y != null) {
      origX = el.x;
      origY = el.y;
    } else {
      // Flow element: compute canvas-local position from offsetLeft/offsetTop
      const wrap = elRef.current?.closest('.bcv-el-wrap');
      origX = wrap ? (wrap as HTMLElement).offsetLeft : 0;
      origY = wrap ? (wrap as HTMLElement).offsetTop : 0;
    }

    dragRef.current = { startX: e.clientX, startY: e.clientY, origX, origY };
    setIsDragging(true);

    // If element was in flow (no x/y), initialize it at its current canvas position
    if (el.x == null || el.y == null) {
      onFreeDragStart?.(el.key, origX, origY);
    } else {
      onFreeDragStart?.(el.key, el.x, el.y);
    }
  }, [el.key, el.x, el.y, onFreeDragStart]);

  const onHandlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !isDragging) return;
    // Account for zoom: divide viewport delta by zoom factor
    const zoom = elRef.current?.closest('.bcv-body')?.classList.contains('builder-zoom-90') ? 0.9
      : elRef.current?.closest('.bcv-body')?.classList.contains('builder-zoom-75') ? 0.75
      : elRef.current?.closest('.bcv-body')?.classList.contains('builder-zoom-60') ? 0.6 : 1;
    const dx = (e.clientX - dragRef.current.startX) / zoom;
    const dy = (e.clientY - dragRef.current.startY) / zoom;
    const newX = snapValue(Math.max(0, dragRef.current.origX + dx));
    const newY = snapValue(Math.max(0, dragRef.current.origY + dy));
    onFreeDragMove?.(el.key, newX, newY);
  }, [isDragging, el.key, onFreeDragMove, snapValue]);

  const onHandlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !isDragging) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const zoom = elRef.current?.closest('.bcv-body')?.classList.contains('builder-zoom-90') ? 0.9
      : elRef.current?.closest('.bcv-body')?.classList.contains('builder-zoom-75') ? 0.75
      : elRef.current?.closest('.bcv-body')?.classList.contains('builder-zoom-60') ? 0.6 : 1;
    const dx = (e.clientX - dragRef.current.startX) / zoom;
    const dy = (e.clientY - dragRef.current.startY) / zoom;
    const finalX = snapValue(Math.max(0, dragRef.current.origX + dx));
    const finalY = snapValue(Math.max(0, dragRef.current.origY + dy));
    dragRef.current = null;
    setIsDragging(false);
    onFreeDragEnd?.(el.key, finalX, finalY);
  }, [isDragging, el.key, onFreeDragEnd, snapValue]);

  // Wrap style
  const wrapStyle: React.CSSProperties = {
    ...resolved.wrapper,
    ...(isPositioned ? {} : { transition: isDragging ? 'none' : undefined }),
  };

  return (
    <div
      ref={elRef}
      style={wrapStyle}
      className={`bcv-el ${selected ? 'selected' : ''} ${isLayout ? 'layout' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`${meta?.label ?? el.type} field: ${el.label}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(e as unknown as React.MouseEvent<HTMLElement>); } }}
    >
      {/* Header */}
      <div className="bcv-el-head">
        <span
          className="bcv-el-handle"
          title="Drag to reposition"
          aria-label="Drag to reposition"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <Icon name="grip-vertical" />
        </span>
        <span className="bcv-el-type">
          <Icon name={meta?.icon ?? 'font'} /> {meta?.label}
        </span>
        {el.required && <span className="bcv-el-required" title="Required" style={resolved.required}>Required</span>}
        {el.type === 'calculated' || el.type === 'prefill' || el.isReadOnly ? (
          <span className="bcv-el-readonly">Read-only</span>
        ) : null}
        <div className="bcv-el-actions">
          {canCrop && (
            <button className="bcv-el-action" title="Crop image" onClick={(e) => { e.stopPropagation(); setShowCrop(true); }} aria-label="Crop image">
              <Icon name="crop-simple" />
            </button>
          )}
          <button className="bcv-el-action" title="Duplicate (Ctrl+D)" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} aria-label="Duplicate">
            <Icon name="copy" />
          </button>
          <button className="bcv-el-action bcv-el-action-danger" title="Delete (Del)" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete">
            <Icon name="trash" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="bcv-el-body">
        {isLayout ? (
          el.type === 'section' ? (
            <div className="bcv-el-section-title" style={resolved.label}>
              <InlineText value={el.label} onCommit={(v) => onPatch(el.key, { label: v })} />
            </div>
          ) : el.type === 'heading' ? (
            <div className="bcv-el-section-title" style={resolved.label}>
              <InlineText value={el.label} onCommit={(v) => onPatch(el.key, { label: v })} />
            </div>
          ) : el.type === 'divider' || el.type === 'spacer' ? (
            <FieldMockup el={el} />
          ) : el.type === 'quote' ? (
            <FieldMockup el={el} />
          ) : el.type === 'container' ? (
            <div className="bcv-container" style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${el.containerLayout?.columns ?? 1}, 1fr)`,
              gap: el.containerLayout?.gap ?? 12,
              background: el.containerLayout?.background,
              border: el.containerLayout?.border ?? '2px dashed var(--border-strong)',
              borderColor: el.containerLayout?.borderColor,
              borderRadius: el.containerLayout?.borderRadius ?? '8px',
              padding: el.containerLayout?.padding ?? '16px',
              minHeight: 60,
            }}>
              <div className="bcv-container-placeholder" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: 8 }}>
                <Icon name="box" /> Drop elements here
              </div>
            </div>
          ) : (
            <div className="bcv-el-instructions" style={resolved.label}>
              <InlineText value={el.label} onCommit={(v) => onPatch(el.key, { label: v })} />
              {el.description && (
                <div className="bcv-el-instructions-desc">
                  <InlineText value={el.description} onCommit={(v) => onPatch(el.key, { description: v || undefined })} />
                </div>
              )}
            </div>
          )
        ) : isDesign ? (
          <FieldMockup el={el} />
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: resolved.labelPosition === 'left' ? 'row' : resolved.labelPosition === 'right' ? 'row-reverse' : 'column',
            gap: resolved.container.gap ?? 0,
            alignItems: resolved.labelPosition && resolved.labelPosition !== 'top' ? 'baseline' : undefined,
          }}>
            {resolved.labelPosition && resolved.labelPosition !== 'top' ? (
              <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
                {!resolved.hideLabel && (
                  <div className="bcv-el-label" style={resolved.label}>
                    <InlineText value={el.label} onCommit={(v) => onPatch(el.key, { label: v })} />
                  </div>
                )}
                {!resolved.hideDescription && (
                  <div className="bcv-el-desc" style={resolved.description}>
                    <InlineText
                      value={el.description ?? ''}
                      placeholder="Add description…"
                      onCommit={(v) => onPatch(el.key, { description: v || undefined })}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                {!resolved.hideLabel && (
                  <div className="bcv-el-label" style={resolved.label}>
                    <InlineText value={el.label} onCommit={(v) => onPatch(el.key, { label: v })} />
                  </div>
                )}
                {!resolved.hideDescription && (
                  <div className="bcv-el-desc" style={resolved.description}>
                    <InlineText
                      value={el.description ?? ''}
                      placeholder="Add description…"
                      onCommit={(v) => onPatch(el.key, { description: v || undefined })}
                    />
                  </div>
                )}
              </>
            )}
            <FieldMockup el={el} inputStyle={resolved.input} />
          </div>
        )}
      </div>

      {/* Footer indicators */}
      <div className="bcv-el-foot">
        {el.branching && (
          <span className="bcv-el-indicator bcv-el-branching">
            <Icon name="code-branch" /> Branching
            {el.branching.endForm ? ' → End form' : el.branching.jumpTo ? ` → ${el.branching.jumpTo}` : ''}
          </span>
        )}
        {el.displayWhen && (
          <span className="bcv-el-indicator bcv-el-condition">
            <Icon name="eye" /> Conditional
          </span>
        )}
        {el.scoring && (
          <span className="bcv-el-indicator bcv-el-scoring">
            <Icon name="trophy" /> Scoring
          </span>
        )}
      </div>

      {/* Resize handles (shown when selected) */}
      {selected && !isDragging && (
        <ElementResizeHandles el={el} onPatch={onPatch} containerRef={elRef} />
      )}

      {/* Crop modal */}
      {showCrop && (
        <ImageCropModal
          el={el}
          onApply={(crop) => { onPatch(el.key, { imageCrop: crop }); setShowCrop(false); }}
          onClose={() => setShowCrop(false)}
        />
      )}
    </div>
  );
});
