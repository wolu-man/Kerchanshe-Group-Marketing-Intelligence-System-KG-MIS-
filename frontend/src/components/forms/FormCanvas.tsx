'use client';

import { useMemo, useRef, useCallback, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Icon } from '@/components/ui';
import type { FormElement, FormPage, FormSchemaEnvelope } from '@/lib/types';
import { DEVICES, type DeviceId, FIELD_TYPE_MAP, zoomClass } from './FormBuilderState';
import { CanvasElement } from './CanvasElement';
import { PageNavigator } from './PageNavigator';
import { FloatingToolbar } from './FloatingToolbar';
import { CanvasRulers } from './CanvasRulers';
import { CanvasGrid } from './CanvasGrid';
import { AlignmentGuides } from './AlignmentGuides';
import { CanvasScrollbar } from './CanvasScrollbar';

// ---------------------------------------------------------------------------
// Drop zone at the top of the canvas
// ---------------------------------------------------------------------------
function CanvasDrop({ pageId }: { pageId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `canvas-drop:${pageId}` });
  return (
    <div
      ref={setNodeRef}
      className={`bcv-drop ${isOver ? 'over' : ''}`}
    >
      {isOver ? 'Drop to add at the start' : 'Drag fields here'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state with quick-add suggestions
// ---------------------------------------------------------------------------
function EmptyState({ onAdd }: { onAdd: (type: string) => void }) {
  const quickFields = ['shorttext', 'multiplechoice', 'dropdown', 'number', 'date', 'section', 'heading', 'divider', 'richtext'];
  return (
    <div className="bcv-empty">
      <div className="bcv-empty-icon">
        <Icon name="wand-magic-sparkles" />
      </div>
      <h3 className="bcv-empty-title">Start building your form</h3>
      <p className="bcv-empty-desc">Drag a field from the left panel or click a quick-add below.</p>
      <div className="bcv-empty-grid">
        {quickFields.map((type) => {
          const meta = FIELD_TYPE_MAP[type as keyof typeof FIELD_TYPE_MAP];
          return meta ? (
            <button key={type} className="bcv-empty-btn" onClick={() => onAdd(type)}>
              <Icon name={meta.icon} />
              <span>{meta.label}</span>
            </button>
          ) : null;
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form canvas
// ---------------------------------------------------------------------------
export function FormCanvas({
  envelope,
  pages,
  activePage,
  elements,
  pageElements,
  selectedKeys,
  device,
  zoom,
  activeDrag,
  onDragStart,
  onDragEnd,
  onCanvasClick,
  onPatch,
  onDuplicate,
  onDelete,
  onAddElement,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onRenamePage,
  onMoveUp,
  onMoveDown,
  onCopyStyle,
  onMoveElementTo,
  showRulers,
  showGrid,
  gridSize,
  layoutGap,
  snapToGrid,
}: {
  envelope: FormSchemaEnvelope;
  pages: FormPage[];
  activePage: string;
  elements: FormElement[];
  pageElements: FormElement[];
  selectedKeys: string[];
  device: DeviceId;
  zoom: number;
  activeDrag: { fromPalette: boolean; type: string } | null;
  onDragStart: (e: DragStartEvent) => void;
  onDragEnd: (ev: DragEndEvent) => void;
  onCanvasClick: (key: string, e: React.MouseEvent<HTMLElement>) => void;
  onPatch: (key: string, patch: Partial<FormElement>) => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
  onAddElement: (type: string) => void;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  onDeletePage: (id: string) => void;
  onRenamePage: (id: string, title: string) => void;
  onMoveUp: (key: string) => void;
  onMoveDown: (key: string) => void;
  onCopyStyle?: (el: FormElement) => void;
  onMoveElementTo?: (key: string, x: number, y: number) => void;
  showRulers?: boolean;
  showGrid?: boolean;
  gridSize?: number;
  layoutGap?: number;
  snapToGrid?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activePageTitle = useMemo(() => pages.find((p) => p.id === activePage)?.title ?? 'Untitled page', [pages, activePage]);
  const deviceWidth = DEVICES[device].width;
  const bodyRef = useRef<HTMLDivElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);

  // Free-drag state
  const [freeDragInfo, setFreeDragInfo] = useState<{ key: string; x: number; y: number } | null>(null);

  const handleFreeDragStart = useCallback((_key: string, x: number, y: number) => {
    setFreeDragInfo({ key: _key, x, y });
  }, []);

  const handleFreeDragMove = useCallback((_key: string, x: number, y: number) => {
    setFreeDragInfo({ key: _key, x, y });
  }, []);

  const handleFreeDragEnd = useCallback((_key: string, x: number, y: number) => {
    setFreeDragInfo(null);
    onMoveElementTo?.(_key, x, y);
  }, [onMoveElementTo]);

  // Canvas height: enough for all elements
  const canvasHeight = useMemo(() => {
    let maxBottom = 300;
    for (const el of pageElements) {
      if (el.x != null && el.y != null) {
        maxBottom = Math.max(maxBottom, el.y + (el.posHeight ?? 120) + 40);
      }
    }
    return Math.max(maxBottom, pageElements.length * 90 + 120);
  }, [pageElements]);

  return (
    <div className="bcv-workspace">
      <div className="bcv-canvas-area">
        {/* Corner piece (0,0) */}
        {showRulers && <div className="bcv-ruler-corner" />}

        {/* Horizontal ruler */}
        <CanvasRulers width={deviceWidth} height={canvasHeight} zoom={zoom} show={Boolean(showRulers)} type="horizontal" />

        {/* Vertical ruler */}
        <CanvasRulers width={deviceWidth} height={canvasHeight} zoom={zoom} show={Boolean(showRulers)} type="vertical" />

        {/* Canvas frame wrapper */}
        <div className="bcv-frame-wrap" ref={frameWrapRef}>
          <div className="bcv-frame" style={{ width: deviceWidth, flexShrink: 0 }}>
            {/* Browser chrome */}
            <div className="bcv-chrome">
              <div className="bcv-dots">
                <span /><span /><span />
              </div>
              <span className="bcv-chrome-title">{activePageTitle}</span>
            </div>

            {/* Canvas body */}
            <div className={`bcv-body ${zoomClass(zoom)}`} ref={bodyRef} style={{ position: 'relative', minHeight: canvasHeight }}>
              {/* Grid overlay */}
              <CanvasGrid show={Boolean(showGrid)} gridSize={gridSize ?? 20} />

              {/* Alignment guides */}
              <AlignmentGuides
                isDragging={Boolean(freeDragInfo || activeDrag)}
                draggedKey={freeDragInfo?.key ?? activeDrag?.type ?? null}
                allKeys={pageElements.map((e) => e.key)}
                containerRef={bodyRef}
              />

              {/* DnD context for palette drops only */}
              <DndContext
                sensors={sensors}
                collisionDetection={undefined}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              >
                <CanvasDrop pageId={activePage} />

                <DragOverlay>
                  {activeDrag?.fromPalette ? (() => {
                    const meta = FIELD_TYPE_MAP[activeDrag.type as keyof typeof FIELD_TYPE_MAP];
                    return meta ? (
                      <div className="bcv-el bcv-overlay">
                        <div className="bcv-el-head">
                          <span className="bcv-el-type">
                            <Icon name={meta.icon} /> {meta.label}
                          </span>
                        </div>
                        <div className="bcv-el-label">{meta.label}</div>
                      </div>
                    ) : null;
                  })() : null}
                </DragOverlay>
              </DndContext>

              {/* All elements — single layer, no SortableContext */}
              {pageElements.length === 0 ? (
                <EmptyState onAdd={onAddElement} />
              ) : (
                <div className="bcv-elements">
                  {pageElements
                    .filter(el => !el.containerKey)
                    .map((el) => {
                      const isSelected = selectedKeys.includes(el.key);
                      const idx = pageElements.findIndex((e) => e.key === el.key);
                      const isPositioned = el.x != null && el.y != null;
                      const isBeingDragged = freeDragInfo?.key === el.key;
                      const children = el.type === 'container' ? pageElements.filter(c => c.containerKey === el.key) : [];

                      return (
                        <div
                          key={el.key}
                          className={`bcv-el-wrap ${isPositioned ? 'bcv-el-positioned' : ''}`}
                          data-element-key={el.key}
                          style={isPositioned ? {
                            position: 'absolute',
                            left: isBeingDragged ? freeDragInfo.x : el.x,
                            top: isBeingDragged ? freeDragInfo.y : el.y,
                            width: el.posWidth ?? 280,
                            zIndex: isSelected ? 10 : 1,
                          } : undefined}
                        >
                          {isSelected && (
                            <FloatingToolbar
                              el={el}
                              onDuplicate={() => onDuplicate(el.key)}
                              onDelete={() => onDelete(el.key)}
                              onMoveUp={() => onMoveUp(el.key)}
                              onMoveDown={() => onMoveDown(el.key)}
                              canUp={idx > 0}
                              canDown={idx < pageElements.length - 1}
                              onCopyStyle={onCopyStyle ? () => onCopyStyle(el) : undefined}
                            />
                          )}
                          <CanvasElement
                            el={el}
                            selected={isSelected}
                            onSelect={(e) => onCanvasClick(el.key, e)}
                            onPatch={onPatch}
                            onDuplicate={() => onDuplicate(el.key)}
                            onDelete={() => onDelete(el.key)}
                            onFreeDragStart={handleFreeDragStart}
                            onFreeDragMove={handleFreeDragMove}
                            onFreeDragEnd={handleFreeDragEnd}
                            snapToGrid={snapToGrid}
                            gridSize={gridSize ?? 20}
                          />
                          {children.map(child => {
                            const childSelected = selectedKeys.includes(child.key);
                            const childIdx = pageElements.findIndex((e) => e.key === child.key);
                            const childPos = child.x != null && child.y != null;
                            const childDrag = freeDragInfo?.key === child.key;

                            return (
                              <div
                                key={child.key}
                                className={`bcv-el-wrap bcv-el-child ${childPos ? 'bcv-el-positioned' : ''}`}
                                data-element-key={child.key}
                                style={childPos ? {
                                  position: 'absolute',
                                  left: childDrag ? freeDragInfo.x : child.x,
                                  top: childDrag ? freeDragInfo.y : child.y,
                                  width: child.posWidth ?? 280,
                                  zIndex: childSelected ? 10 : 1,
                                } : undefined}
                              >
                                {childSelected && (
                                  <FloatingToolbar
                                    el={child}
                                    onDuplicate={() => onDuplicate(child.key)}
                                    onDelete={() => onDelete(child.key)}
                                    onMoveUp={() => onMoveUp(child.key)}
                                    onMoveDown={() => onMoveDown(child.key)}
                                    canUp={childIdx > 0}
                                    canDown={childIdx < pageElements.length - 1}
                                    onCopyStyle={onCopyStyle ? () => onCopyStyle(child) : undefined}
                                  />
                                )}
                                <CanvasElement
                                  el={child}
                                  selected={childSelected}
                                  onSelect={(e) => onCanvasClick(child.key, e)}
                                  onPatch={onPatch}
                                  onDuplicate={() => onDuplicate(child.key)}
                                  onDelete={() => onDelete(child.key)}
                                  onFreeDragStart={handleFreeDragStart}
                                  onFreeDragMove={handleFreeDragMove}
                                  onFreeDragEnd={handleFreeDragEnd}
                                  snapToGrid={snapToGrid}
                                  gridSize={gridSize ?? 20}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Custom horizontal scrollbar */}
      <CanvasScrollbar scrollRef={frameWrapRef} />

      {/* Page navigator */}
      <PageNavigator
        pages={pages}
        activePage={activePage}
        onSelect={onSelectPage}
        onAdd={onAddPage}
        onDelete={onDeletePage}
        onRename={onRenamePage}
      />
    </div>
  );
}
