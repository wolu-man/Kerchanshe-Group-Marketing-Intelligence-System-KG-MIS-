'use client';

import { useCallback, useRef, useState } from 'react';
import type { FormElement } from '@/lib/types';

// ---------------------------------------------------------------------------
// Resize handle directions
// ---------------------------------------------------------------------------
type HandleDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const HANDLE_CURSORS: Record<HandleDir, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize',
};

// ---------------------------------------------------------------------------
// ElementResizeHandles — 8 edge/corner drag handles
// ---------------------------------------------------------------------------
export function ElementResizeHandles({
  el,
  onPatch,
  containerRef,
}: {
  el: FormElement;
  onPatch: (key: string, patch: Partial<FormElement>) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const [dragging, setDragging] = useState<HandleDir | null>(null);
  const startRef = useRef<{ dir: HandleDir; x: number; y: number; w: number; h: number } | null>(null);

  const onPointerDown = useCallback((dir: HandleDir, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    startRef.current = { dir, x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
    setDragging(dir);
  }, [containerRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !startRef.current) return;
    const { dir, x: sx, y: sy, w: sw, h: sh } = startRef.current;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;

    let newW = sw;
    let newH = sh;

    if (dir.includes('e')) newW = Math.max(120, sw + dx);
    if (dir.includes('w')) newW = Math.max(120, sw - dx);
    if (dir.includes('s')) newH = Math.max(60, sh + dy);
    if (dir.includes('n')) newH = Math.max(60, sh - dy);

    const patch: Partial<FormElement> = {};
    if (dir.includes('e') || dir.includes('w')) {
      patch.style = { ...(el.style ?? {}), width: `${Math.round(newW)}px` };
    }
    if (dir.includes('n') || dir.includes('s')) {
      patch.style = { ...(el.style ?? {}), ...(patch.style ?? {}), minHeight: `${Math.round(newH)}px` };
    }
    onPatch(el.key, patch);
  }, [dragging, el, onPatch]);

  const onPointerUp = useCallback(() => {
    setDragging(null);
    startRef.current = null;
  }, []);

  const handles: HandleDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  return (
    <div className="bcv-resize-handles" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {handles.map((dir) => (
        <div
          key={dir}
          className={`bcv-resize-handle bcv-resize-${dir} ${dragging === dir ? 'active' : ''}`}
          style={{ cursor: HANDLE_CURSORS[dir] }}
          onPointerDown={(e) => onPointerDown(dir, e)}
          title={`Resize ${dir}`}
          aria-label={`Resize ${dir}`}
        />
      ))}
      {dragging && (
        <div className="bcv-resize-tooltip">
          {Math.round(containerRef.current?.getBoundingClientRect().width ?? 0)} × {Math.round(containerRef.current?.getBoundingClientRect().height ?? 0)}
        </div>
      )}
    </div>
  );
}
