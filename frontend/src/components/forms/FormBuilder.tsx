'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { FormSchemaEnvelope, FieldType } from '@/lib/types';
import { elementsOnPage } from '@/lib/form-engine';
import { FormRenderer } from '@/components/forms/FormRenderer';
import {
  useFormBuilderState,
  emptyElement,
  DEVICES,
  FIELD_CATEGORIES,
} from './FormBuilderState';
import { FormBuilderToolbar } from './FormBuilderToolbar';
import { FieldLibrary } from './FieldLibrary';
import { PropertiesPanel } from './PropertiesPanel';
import { FormCanvas } from './FormCanvas';
import { AiAssistant } from './AiAssistant';
import { Icon } from '@/components/ui';
import { DraggablePanel } from './DraggablePanel';

// ---------------------------------------------------------------------------
// Main Form Builder — thin orchestrator
// ---------------------------------------------------------------------------
export function FormBuilder({ initial, onChange, onDirtyChange, dirtyResetSignal, formId, formTitle, formStatus, formVersion, onAutosave }: {
  initial: FormSchemaEnvelope;
  onChange: (envelope: FormSchemaEnvelope) => void;
  onDirtyChange?: (dirty: boolean) => void;
  dirtyResetSignal?: number;
  formId?: number;
  formTitle?: string;
  formStatus?: string;
  formVersion?: number | null;
  onAutosave?: (envelope: FormSchemaEnvelope) => Promise<void>;
}) {
  const state = useFormBuilderState(initial, onChange, onDirtyChange, dirtyResetSignal);

  // Local answers for the preview modal so typing sticks (schema display was
  // already correct; controlled inputs previously forced values back to "").
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [aiOpen, setAiOpen] = useState(false);

  // The assistant returns a validated envelope; committing it goes through the
  // same undo/autosave pipeline as every manual edit.
  const applyAiEnvelope = useCallback((next: FormSchemaEnvelope) => {
    state.commit(next.elements ?? [], next.pages, next.branding);
    const ids = new Set((next.pages ?? []).map((p) => p.id));
    if (!ids.has(state.activePage)) {
      const fallback = next.pages?.[0]?.id;
      if (fallback) state.setActivePage(fallback);
    }
  }, [state]);

  // ---- Autosave (debounced 3s after last edit) ----------------------------
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<number | null>(null);
  const autosaveInFlightRef = useRef<boolean>(false);
  const envelopeRef = useRef(state.envelope);
  envelopeRef.current = state.envelope;
  const dirtyRef = useRef(state.dirty);
  dirtyRef.current = state.dirty;
  // Bumped after an in-flight save finishes while newer edits are pending,
  // so the effect re-runs and re-arms the debounce timer.
  const [rearmTick, setRearmTick] = useState(0);

  useEffect(() => {
    if (!state.dirty || !onAutosave) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Never stack concurrent autosaves — re-arm after the current one finishes.
    if (autosaveInFlightRef.current) return;

    state.setSaveStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      if (autosaveInFlightRef.current) return;
      autosaveInFlightRef.current = true;
      const toSave = envelopeRef.current;
      try {
        await onAutosave(toSave);
        // Only mark clean if the user has not edited during the save.
        if (envelopeRef.current === toSave) {
          state.setDirty(false);
        }
        state.setSaveStatus('saved');
        lastSavedRef.current = Date.now();
        state.setLastSavedAt(Date.now());
      } catch {
        state.setSaveStatus('unsaved');
      } finally {
        autosaveInFlightRef.current = false;
        if (dirtyRef.current) setRearmTick((t) => t + 1);
      }
    }, 3000);

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state.dirty, state.envelope, onAutosave, rearmTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Keyboard shortcuts -------------------------------------------------
  const hotkeys = useRef({
    previewOpen: state.preview,
    undo: state.undo,
    redo: state.redo,
    duplicateKeys: state.duplicateKeys,
    deleteKeys: state.deleteKeys,
    copySelected: state.copySelected,
    pasteClipboard: state.pasteClipboard,
    selectedKeys: state.selectedKeys,
    closePreview: () => state.setPreview(false),
    selectAll: state.selectAll,
  });
  hotkeys.current = {
    previewOpen: state.preview,
    undo: state.undo,
    redo: state.redo,
    duplicateKeys: state.duplicateKeys,
    deleteKeys: state.deleteKeys,
    copySelected: state.copySelected,
    pasteClipboard: state.pasteClipboard,
    selectedKeys: state.selectedKeys,
    closePreview: () => state.setPreview(false),
    selectAll: state.selectAll,
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      const h = hotkeys.current;
      if (h.previewOpen) {
        if (e.key === 'Escape') h.closePreview();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) h.redo(); else h.undo(); return; }
      if (mod && key === 'y') { e.preventDefault(); h.redo(); return; }
      if (mod && key === 'd') { e.preventDefault(); h.duplicateKeys(h.selectedKeys); return; }
      if (mod && key === 'c') { e.preventDefault(); h.copySelected(); return; }
      if (mod && key === 'v') { e.preventDefault(); h.pasteClipboard(); return; }
      if (mod && key === 'a') { e.preventDefault(); h.selectAll(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); h.deleteKeys(h.selectedKeys); return; }
      if (e.key === 'Escape') state.deselectAll();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- DnD handlers -------------------------------------------------------
  const handleDragStart = useCallback((e: DragStartEvent) => {
    const data = e.active.data.current as { fromPalette?: boolean; fieldType?: string } | undefined;
    state.setActiveDrag({ fromPalette: data?.fromPalette ?? false, type: String(e.active.id) });
    const key = String(e.active.id);
    if (!data?.fromPalette) {
      state.setSelection([key]);
    }
  }, [state]);

  const handleDragEnd = useCallback((ev: DragEndEvent) => {
    state.setActiveDrag(null);
    const activeData = ev.active.data.current as { fromPalette?: boolean; fieldType?: string } | undefined ?? { fromPalette: false };

    if (activeData.fromPalette) {
      const type = activeData.fieldType as FieldType;
      if (ev.over) {
        const overKey = String(ev.over.id);
        const dropPage = overKey.startsWith('canvas-drop') ? state.activePage : (state.elements.find((e) => e.key === overKey)?.pageId ?? state.activePage);

        if (dropPage !== state.activePage) {
          state.setActivePage(dropPage);
          const targetList = elementsOnPage(state.elements, dropPage);
          const flatIdx = state.elements.findIndex((e) => (e.pageId ?? 'page-1') === dropPage);
          const insertIdx = flatIdx === -1 ? state.elements.length : flatIdx + targetList.length;
          const next = [...state.elements];
          next.splice(insertIdx, 0, emptyElement(type, insertIdx, dropPage));
          state.commit(next);
          return;
        }

        const pageList = elementsOnPage(state.elements, state.activePage);
        const overIdx = pageList.findIndex((e) => e.key === overKey);
        const next = [...state.elements];
        const flatIdx = state.elements.findIndex((e) => (e.pageId ?? 'page-1') === state.activePage);
        const relIdx = Math.min(Math.max(overIdx, 0), pageList.length);
        next.splice(flatIdx + relIdx, 0, emptyElement(type, 0, state.activePage));
        state.commit(next.map((e, i) => ({ ...e, order: i })));
        return;
      }

      state.addElement(type);
      return;
    }

    // Reorder within active page
    const overTarget = ev.over;
    if (!overTarget) return;
    const pageElements = elementsOnPage(state.elements, state.activePage);
    const from = pageElements.findIndex((e) => e.key === String(ev.active.id));
    const to = pageElements.findIndex((e) => e.key === String(overTarget.id));
    if (from === -1 || to === -1 || from === to) return;
    const reordered = arrayMove(pageElements, from, to);
    const others = state.elements.filter((e) => (e.pageId ?? 'page-1') !== state.activePage);
    state.commit([...others, ...reordered]);
  }, [state]);

  // ---- Preview state ------------------------------------------------------
  const previewEnvelope = state.envelope;

  // ---- Strip icons for collapsed left panel --------------------------------
  const CATEGORY_ICONS: Record<string, string> = {
    text: 'font', choice: 'square-check', numbers: 'hashtag', 'date-time': 'clock',
    media: 'paperclip', location: 'location-dot', advanced: 'wand-magic-sparkles', design: 'shapes',
  };
  const stripIcons = (
    <>
      {FIELD_CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          className="dp-strip-icon-btn"
          title={cat.label}
          aria-label={`Open ${cat.label} fields`}
          onClick={() => state.setLeftPanelOpen(true)}
        >
          <Icon name={CATEGORY_ICONS[cat.id] ?? 'shapes'} />
        </button>
      ))}
    </>
  );

  return (
    <div className="builder-root">
      {/* Top toolbar */}
      <FormBuilderToolbar
        formTitle={formTitle ?? 'Untitled Form'}
        formStatus={formStatus}
        formVersion={formVersion}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onUndo={state.undo}
        onRedo={state.redo}
        dirty={state.dirty}
        saveStatus={state.saveStatus}
        lastSavedAt={state.lastSavedAt}
        onPreview={() => state.setPreview(true)}
        device={state.device}
        onDeviceChange={state.setDevice}
        zoom={state.zoom}
        onZoomChange={state.setZoom}
        elementsCount={state.elements.length}
        totalPoints={state.totalPoints}
        preview={state.preview}
        onClosePreview={() => state.setPreview(false)}
        leftPanelOpen={state.leftPanelOpen}
        onToggleLeftPanel={() => state.setLeftPanelOpen(!state.leftPanelOpen)}
        rightPanelOpen={state.rightPanelOpen}
        onToggleRightPanel={() => state.setRightPanelOpen(!state.rightPanelOpen)}
        showRulers={state.showRulers}
        onToggleRulers={() => state.setShowRulers(!state.showRulers)}
        showGrid={state.showGrid}
        onToggleGrid={() => state.setShowGrid(!state.showGrid)}
        snapToGrid={state.snapToGrid}
        onToggleSnap={() => state.setSnapToGrid(!state.snapToGrid)}
        aiOpen={aiOpen}
        onToggleAi={() => setAiOpen((v) => !v)}
      />

      {/* Main workspace */}
      <div className={`builder-workspace ${state.leftPanelLayout.dock === 'floating' ? 'left-floating' : state.leftPanelOpen ? '' : 'left-closed'} ${state.rightPanelLayout.dock === 'floating' ? 'right-floating' : state.rightPanelOpen ? '' : 'right-closed'}`}>
        {/* Left panel: Field library */}
        <DraggablePanel
          id="elements-panel"
          title="Elements"
          icon="shapes"
          layout={state.leftPanelLayout}
          onLayoutChange={state.setLeftPanelLayout}
          isOpen={state.leftPanelOpen}
          onToggleOpen={() => state.setLeftPanelOpen(!state.leftPanelOpen)}
          stripPosition="left"
          stripContent={stripIcons}
        >
          <FieldLibrary onAdd={state.addElement} />
        </DraggablePanel>

        {/* Center: Canvas */}
        <main className="builder-center">
          <FormCanvas
            envelope={state.envelope}
            pages={state.pages}
            activePage={state.activePage}
            elements={state.elements}
            pageElements={state.pageElements}
            selectedKeys={state.selectedKeys}
            device={state.device}
            zoom={state.zoom}
            activeDrag={state.activeDrag}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onCanvasClick={state.handleCanvasClick}
            onPatch={state.patchElement}
            onDuplicate={(key) => state.duplicateKeys([key])}
            onDelete={(key) => state.deleteKeys([key])}
            onAddElement={(t) => state.addElement(t as FieldType)}
            onSelectPage={state.setActivePage}
            onAddPage={state.addPage}
            onDeletePage={state.deletePage}
            onRenamePage={state.renamePage}
            onMoveUp={(key) => state.moveElement(key, -1)}
            onMoveDown={(key) => state.moveElement(key, 1)}
            onCopyStyle={state.copyStyle}
            onMoveElementTo={state.moveElementTo}
            showRulers={state.showRulers}
            showGrid={state.showGrid}
            gridSize={state.gridSize}
            layoutGap={state.layoutGap}
            snapToGrid={state.snapToGrid}
          />
        </main>

        {/* Right panel: Properties */}
        <DraggablePanel
          id="properties-panel"
          title="Properties"
          icon="sliders"
          layout={state.rightPanelLayout}
          onLayoutChange={state.setRightPanelLayout}
          isOpen={state.rightPanelOpen}
          onToggleOpen={() => state.setRightPanelOpen(!state.rightPanelOpen)}
          stripPosition="right"
        >
          <PropertiesPanel
            selectedKeys={state.selectedKeys}
            elements={state.elements}
            pageElements={state.pageElements}
            activePage={state.activePage}
            pages={state.pages}
            onPatch={state.patchElement}
            onDelete={() => state.deleteKeys([state.selectedKeys[0]])}
            onDuplicate={() => state.duplicateKeys([state.selectedKeys[0]])}
            onMove={(dir) => state.moveElement(state.selectedKeys[0], dir)}
            onDeleteKeys={state.deleteKeys}
            onDuplicateKeys={state.duplicateKeys}
            onRenamePage={state.renamePage}
            branding={state.branding}
            onBrandingChange={state.setBranding}
            copiedStyle={state.copiedStyle}
            onPasteStyleToSelected={state.pasteStyleToSelected}
          />
        </DraggablePanel>
      </div>

      {/* AI Form Assistant (slide-over, overlays the workspace) */}
      {!state.preview && (
        <AiAssistant
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          formId={formId}
          envelope={state.envelope}
          onApply={applyAiEnvelope}
        />
      )}

      {/* Preview modal */}
      {state.preview && (
        <div className="preview-modal-backdrop" onClick={() => state.setPreview(false)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <button className="preview-modal-close" onClick={() => state.setPreview(false)} title="Close preview" aria-label="Close preview">
                <Icon name="arrow-left" /> Back to builder
              </button>
              <span className="preview-modal-title">Form Preview</span>
              <div className="preview-modal-device">
                {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
                  <button
                    key={d}
                    className={`preview-modal-device-btn ${state.device === d ? 'active' : ''}`}
                    onClick={() => state.setDevice(d)}
                    title={DEVICES[d].label}
                    aria-label={`Preview on ${DEVICES[d].label}`}
                  >
                    <Icon name={DEVICES[d].icon} />
                  </button>
                ))}
              </div>
            </div>
            <div className="preview-modal-body">
              <div style={{ width: DEVICES[state.device].width, maxWidth: '100%', margin: '0 auto', overflowX: 'hidden' }}>
                <FormRenderer
                  envelope={previewEnvelope}
                  answers={previewAnswers}
                  setAnswers={setPreviewAnswers}
                  branding={state.branding}
                  allowDrafts={false}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
