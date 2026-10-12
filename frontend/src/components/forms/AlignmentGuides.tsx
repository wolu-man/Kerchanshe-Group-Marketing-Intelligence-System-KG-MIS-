'use client';

import { useEffect, useState, useRef } from 'react';

// ---------------------------------------------------------------------------
// Alignment guide line
// ---------------------------------------------------------------------------
interface GuideLine {
  id: string;
  type: 'horizontal' | 'vertical';
  position: number; // px from canvas top/left
}

// ---------------------------------------------------------------------------
// AlignmentGuides — shows alignment guides during drag operations
// ---------------------------------------------------------------------------
export function AlignmentGuides({ isDragging, draggedKey, allKeys, containerRef }: {
  isDragging: boolean;
  draggedKey: string | null;
  allKeys: string[];
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!isDragging || !draggedKey) {
      setGuides([]);
      return;
    }

    const compute = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const draggedEl = container.querySelector(`[data-element-key="${draggedKey}"]`) as HTMLElement | null;
      if (!draggedEl) return;

      const draggedRect = draggedEl.getBoundingClientRect();
      const newGuides: GuideLine[] = [];

      // Center of dragged element
      const draggedCenterX = draggedRect.left + draggedRect.width / 2 - containerRect.left;
      const draggedCenterY = draggedRect.top + draggedRect.height / 2 - containerRect.top;
      const draggedLeft = draggedRect.left - containerRect.left;
      const draggedRight = draggedRect.right - containerRect.left;
      const draggedTop = draggedRect.top - containerRect.top;

      // Page center guide
      const pageCenterX = containerRect.width / 2;
      if (Math.abs(draggedCenterX - pageCenterX) < 5) {
        newGuides.push({ id: 'center-x', type: 'vertical', position: pageCenterX });
      }
      const pageCenterY = containerRect.height / 2;
      if (Math.abs(draggedCenterY - pageCenterY) < 5) {
        newGuides.push({ id: 'center-y', type: 'horizontal', position: pageCenterY });
      }

      // Check against other elements
      for (const key of allKeys) {
        if (key === draggedKey) continue;
        const el = container.querySelector(`[data-element-key="${key}"]`) as HTMLElement | null;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const elCenterX = rect.left + rect.width / 2 - containerRect.left;
        const elCenterY = rect.top + rect.height / 2 - containerRect.top;
        const elLeft = rect.left - containerRect.left;
        const elTop = rect.top - containerRect.top;

        // Vertical alignment (x-axis)
        if (Math.abs(draggedLeft - elLeft) < 5) {
          newGuides.push({ id: `left-${key}`, type: 'vertical', position: elLeft });
        }
        if (Math.abs(draggedCenterX - elCenterX) < 5) {
          newGuides.push({ id: `center-${key}`, type: 'vertical', position: elCenterX });
        }
        if (Math.abs(draggedRight - (rect.right - containerRect.left)) < 5) {
          newGuides.push({ id: `right-${key}`, type: 'vertical', position: rect.right - containerRect.left });
        }

        // Horizontal alignment (y-axis)
        if (Math.abs(draggedTop - elTop) < 5) {
          newGuides.push({ id: `top-${key}`, type: 'horizontal', position: elTop });
        }
        if (Math.abs(draggedCenterY - elCenterY) < 5) {
          newGuides.push({ id: `centerY-${key}`, type: 'horizontal', position: elCenterY });
        }
      }

      setGuides(newGuides);
    };

    // Poll during drag
    const tick = () => {
      compute();
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameRef.current);
  }, [isDragging, draggedKey, allKeys, containerRef]);

  if (guides.length === 0) return null;

  return (
    <div className="bcv-guides" aria-hidden="true">
      {guides.map((g) => (
        <div
          key={g.id}
          className={`bcv-guide bcv-guide-${g.type}`}
          style={g.type === 'horizontal'
            ? { top: g.position, left: 0, right: 0 }
            : { left: g.position, top: 0, bottom: 0 }
          }
        />
      ))}
    </div>
  );
}
