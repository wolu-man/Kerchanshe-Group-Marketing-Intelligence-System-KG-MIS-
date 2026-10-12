'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Icon } from '@/components/ui';

// ---------------------------------------------------------------------------
// Panel position types
// ---------------------------------------------------------------------------
export type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'floating';

export interface PanelLayout {
  dock: DockPosition;
  floatingX: number;
  floatingY: number;
  floatingW: number;
  floatingH: number;
  dockedWidth: number;
  dockedHeight: number;
}

// ---------------------------------------------------------------------------
// Default layouts for each panel
// ---------------------------------------------------------------------------
export const DEFAULT_LEFT_LAYOUT: PanelLayout = {
  dock: 'left', floatingX: 0, floatingY: 0, floatingW: 280, floatingH: 500, dockedWidth: 260, dockedHeight: 300,
};
export const DEFAULT_RIGHT_LAYOUT: PanelLayout = {
  dock: 'right', floatingX: 0, floatingY: 0, floatingW: 340, floatingH: 500, dockedWidth: 320, dockedHeight: 300,
};

// ---------------------------------------------------------------------------
// Dock drop zones (rendered during drag)
// ---------------------------------------------------------------------------
function DockZones({ onDock }: { onDock: (pos: DockPosition) => void }) {
  return (
    <div className="dp-dock-zones" aria-label="Dock zones">
      <button className="dp-dock-zone dp-dock-left" onPointerUp={() => onDock('left')} title="Dock left">
        <Icon name="arrow-left" />
      </button>
      <button className="dp-dock-zone dp-dock-right" onPointerUp={() => onDock('right')} title="Dock right">
        <Icon name="arrow-right" />
      </button>
      <button className="dp-dock-zone dp-dock-top" onPointerUp={() => onDock('top')} title="Dock top">
        <Icon name="arrow-up" />
      </button>
      <button className="dp-dock-zone dp-dock-bottom" onPointerUp={() => onDock('bottom')} title="Dock bottom">
        <Icon name="arrow-down" />
      </button>
      <button className="dp-dock-zone dp-dock-float" onPointerUp={() => onDock('floating')} title="Float">
        <Icon name="expand" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DraggablePanel — wraps a panel with drag-to-dock/float behavior
// ---------------------------------------------------------------------------
export function DraggablePanel({
  id,
  title,
  icon,
  layout,
  onLayoutChange,
  isOpen,
  onToggleOpen,
  stripPosition,
  stripContent,
  children,
}: {
  id: string;
  title: string;
  icon: string;
  layout: PanelLayout;
  onLayoutChange: (layout: PanelLayout) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  stripPosition?: 'left' | 'right';
  stripContent?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [showDockZones, setShowDockZones] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isFloating = layout.dock === 'floating' && isOpen;

  // ---- Drag handle pointer events ----
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      origX: layout.floatingX,
      origY: layout.floatingY,
    };
    setDragging(true);
    setShowDockZones(true);
  }, [isOpen, layout.floatingX, layout.floatingY]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const newX = dragStartRef.current.origX + dx;
    const newY = dragStartRef.current.origY + dy;
    onLayoutChange({
      ...layout,
      dock: 'floating',
      floatingX: Math.max(0, newX),
      floatingY: Math.max(0, newY),
    });
  }, [dragging, layout, onLayoutChange]);

  const onPointerUp = useCallback(() => {
    setDragging(false);
    setShowDockZones(false);
    dragStartRef.current = null;
  }, []);

  const handleDock = useCallback((pos: DockPosition) => {
    if (pos === 'floating') {
      // Convert current docked position to floating
      onLayoutChange({
        ...layout,
        dock: 'floating',
        floatingX: layout.dock === 'left' ? 0 : layout.dock === 'right' ? window.innerWidth - layout.floatingW - 40 : 100,
        floatingY: 80,
      });
    } else {
      onLayoutChange({ ...layout, dock: pos });
    }
    setShowDockZones(false);
    setDragging(false);
  }, [layout, onLayoutChange]);

  // Close floating panel on Escape
  useEffect(() => {
    if (!isFloating) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleOpen();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFloating, onToggleOpen]);

  // ---- Floating mode ----
  if (isFloating) {
    return (
      <div
        ref={panelRef}
        className={`dp-floating ${dragging ? 'dp-dragging' : ''}`}
        style={{ left: layout.floatingX, top: layout.floatingY, width: layout.floatingW, height: layout.floatingH }}
      >
        <div className="dp-header" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <span className="dp-header-icon"><Icon name={icon} /></span>
          <span className="dp-header-title">{title}</span>
          <button className="dp-header-btn" onClick={onToggleOpen} title="Undock" aria-label="Undock panel">
            <Icon name="compress" />
          </button>
          <button className="dp-header-btn" onClick={() => handleDock(layout.dock === 'left' ? 'right' : 'left')} title="Swap sides" aria-label="Swap sides">
            <Icon name="right-left" />
          </button>
          <button className="dp-header-btn dp-close" onClick={onToggleOpen} title="Close" aria-label="Close panel">
            <Icon name="xmark" />
          </button>
        </div>
        {showDockZones && <DockZones onDock={handleDock} />}
        <div className="dp-body">{children}</div>
      </div>
    );
  }

  // ---- Docked mode ----
  const isHorizontalDock = layout.dock === 'top' || layout.dock === 'bottom';
  const stripSide = stripPosition ?? (layout.dock === 'left' || layout.dock === 'top' ? 'left' : 'right');

  if (!isOpen) {
    return (
      <div className={`dp-stripped dp-stripped-${stripSide}`}>
        {stripContent && <div className="dp-strip-icons">{stripContent}</div>}
        <button className="panel-strip-toggle" onClick={onToggleOpen} title={`Open ${title}`} aria-label={`Open ${title}`}>
          <Icon name={stripSide === 'left' ? 'chevron-right' : 'chevron-left'} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`dp-docked dp-docked-${layout.dock} ${dragging ? 'dp-dragging' : ''}`}
    >
      <div className="dp-header" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <span className="dp-header-icon"><Icon name={icon} /></span>
        <span className="dp-header-title">{title}</span>
        <button className="dp-header-btn" onClick={() => handleDock(layout.dock === 'left' ? 'right' : layout.dock === 'right' ? 'left' : layout.dock)} title="Swap sides" aria-label="Swap sides">
          <Icon name="right-left" />
        </button>
        <button className="dp-header-btn" onClick={() => handleDock('floating')} title="Float" aria-label="Float panel">
            <Icon name="expand" />
        </button>
        <button className="dp-header-btn dp-close" onClick={onToggleOpen} title="Collapse" aria-label="Collapse panel">
          <Icon name="xmark" />
        </button>
      </div>
      {showDockZones && <DockZones onDock={handleDock} />}
      <div className="dp-body">{children}</div>
    </div>
  );
}
