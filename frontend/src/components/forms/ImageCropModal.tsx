'use client';

import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import type { FormElement } from '@/lib/types';

// ---------------------------------------------------------------------------
// ImageCropModal — draggable crop area over an image
// ---------------------------------------------------------------------------
export function ImageCropModal({
  el,
  onApply,
  onClose,
}: {
  el: FormElement;
  onApply: (crop: { x: number; y: number; w: number; h: number }) => void;
  onClose: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState(() => el.imageCrop ?? { x: 0, y: 0, w: 100, h: 100 });
  const [dragging, setDragging] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const startRef = useRef<{ mx: number; my: number; crop: typeof crop } | null>(null);

  const toPercent = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  }, []);

  const onPointerDown = useCallback((mode: 'move' | 'nw' | 'ne' | 'sw' | 'se', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { mx: e.clientX, my: e.clientY, crop: { ...crop } };
    setDragging(mode);
  }, [crop]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !startRef.current || !imgRef.current) return;
    const { mx, my, crop: sc } = startRef.current;
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    const dxPct = ((e.clientX - mx) / rect.width) * 100;
    const dyPct = ((e.clientY - my) / rect.height) * 100;

    let next = { ...sc };

    if (dragging === 'move') {
      next.x = Math.max(0, Math.min(100 - sc.w, sc.x + dxPct));
      next.y = Math.max(0, Math.min(100 - sc.h, sc.y + dyPct));
    } else {
      // Corner resize
      if (dragging === 'se') {
        next.w = Math.max(10, Math.min(100 - sc.x, sc.w + dxPct));
        next.h = Math.max(10, Math.min(100 - sc.y, sc.h + dyPct));
      } else if (dragging === 'sw') {
        const newW = Math.max(10, sc.w - dxPct);
        next.x = sc.x + (sc.w - newW);
        next.w = newW;
        next.h = Math.max(10, Math.min(100 - sc.y, sc.h + dyPct));
      } else if (dragging === 'ne') {
        next.w = Math.max(10, Math.min(100 - sc.x, sc.w + dxPct));
        const newH = Math.max(10, sc.h - dyPct);
        next.y = sc.y + (sc.h - newH);
        next.h = newH;
      } else if (dragging === 'nw') {
        const newW = Math.max(10, sc.w - dxPct);
        const newH = Math.max(10, sc.h - dyPct);
        next.x = sc.x + (sc.w - newW);
        next.y = sc.y + (sc.h - newH);
        next.w = newW;
        next.h = newH;
      }
      // Clamp
      next.x = Math.max(0, next.x);
      next.y = Math.max(0, next.y);
      next.w = Math.min(100 - next.x, next.w);
      next.h = Math.min(100 - next.y, next.h);
    }
    setCrop(next);
  }, [dragging]);

  const onPointerUp = useCallback(() => { setDragging(null); startRef.current = null; }, []);

  return (
    <div className="crop-modal-backdrop" onClick={onClose}>
      <div className="crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="crop-modal-header">
          <button className="crop-modal-close" onClick={onClose} title="Cancel">
            <Icon name="xmark" /> Cancel
          </button>
          <span className="crop-modal-title">Crop Image</span>
          <button className="crop-modal-apply" onClick={() => onApply(crop)} title="Apply crop">
            <Icon name="check" /> Apply
          </button>
        </div>
        <div className="crop-modal-body">
          <div className="crop-container">
            <img
              ref={imgRef}
              src={el.imageUrl}
              alt={el.imageAlt || ''}
              className="crop-image"
              draggable={false}
            />
            {/* Crop overlay */}
            <div
              className="crop-overlay"
              style={{
                left: `${crop.x}%`, top: `${crop.y}%`,
                width: `${crop.w}%`, height: `${crop.h}%`,
              }}
              onPointerDown={(e) => onPointerDown('move', e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <div className="crop-dim crop-dim-t" />
              <div className="crop-dim crop-dim-b" />
              <div className="crop-dim crop-dim-l" />
              <div className="crop-dim crop-dim-r" />
              {/* Corner handles */}
              <div className="crop-handle crop-nw" onPointerDown={(e) => onPointerDown('nw', e)} />
              <div className="crop-handle crop-ne" onPointerDown={(e) => onPointerDown('ne', e)} />
              <div className="crop-handle crop-sw" onPointerDown={(e) => onPointerDown('sw', e)} />
              <div className="crop-handle crop-se" onPointerDown={(e) => onPointerDown('se', e)} />
              {/* Grid lines */}
              <div className="crop-grid">
                <div className="crop-grid-line crop-grid-v1" />
                <div className="crop-grid-line crop-grid-v2" />
                <div className="crop-grid-line crop-grid-h1" />
                <div className="crop-grid-line crop-grid-h2" />
              </div>
            </div>
          </div>
          <div className="crop-info">
            {Math.round(crop.w)}% × {Math.round(crop.h)}%
          </div>
        </div>
      </div>
    </div>
  );
}
