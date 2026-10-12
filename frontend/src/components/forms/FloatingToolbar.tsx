'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { FIELD_TYPE_MAP } from './FormBuilderState';
import type { FormElement } from '@/lib/types';

export function FloatingToolbar({
  el,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  canUp,
  canDown,
  onCopyStyle,
}: {
  el: FormElement;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canUp: boolean;
  canDown: boolean;
  onCopyStyle?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const elNode = ref.current?.closest('.bcv-el') as HTMLElement | null;
    if (!elNode) return;
    const observer = new ResizeObserver(() => {
      const r = elNode.getBoundingClientRect();
      const canvas = elNode.closest('.bcv-body') as HTMLElement | null;
      const canvasR = canvas?.getBoundingClientRect();
      if (canvasR) {
        setPos({
          top: r.top - canvasR.top + r.height / 2,
          left: r.right - canvasR.left + 6,
        });
      }
    });
    observer.observe(elNode);
    return () => observer.disconnect();
  }, []);

  const meta = FIELD_TYPE_MAP[el.type];

  return (
    <div ref={ref} className="bcv-float-toolbar" style={pos ? { top: pos.top, left: pos.left, transform: 'translate(0, -50%)' } : undefined}>
      <span className="bcv-float-type">
        <Icon name={meta?.icon ?? 'font'} /> {meta?.label}
      </span>
      <div className="bcv-float-divider" />
      <button className="bcv-float-btn" disabled={!canUp} onClick={onMoveUp} title="Move up" aria-label="Move up">
        <Icon name="arrow-up" />
      </button>
      <button className="bcv-float-btn" disabled={!canDown} onClick={onMoveDown} title="Move down" aria-label="Move down">
        <Icon name="arrow-down" />
      </button>
      <button className="bcv-float-btn" onClick={onDuplicate} title="Duplicate" aria-label="Duplicate">
        <Icon name="copy" />
      </button>
      {onCopyStyle && (
        <button className="bcv-float-btn" onClick={onCopyStyle} title="Copy style" aria-label="Copy style">
          <Icon name="paintbrush" />
        </button>
      )}
      <button className="bcv-float-btn bcv-float-btn-danger" onClick={onDelete} title="Delete" aria-label="Delete">
        <Icon name="trash" />
      </button>
    </div>
  );
}
