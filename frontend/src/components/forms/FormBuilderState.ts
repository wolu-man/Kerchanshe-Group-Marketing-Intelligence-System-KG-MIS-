'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormBranding, FormElement, FormPage, FormSchemaEnvelope, FieldType, FieldStyle } from '@/lib/types';
import type { PanelLayout } from './DraggablePanel';
import { DEFAULT_LEFT_LAYOUT, DEFAULT_RIGHT_LAYOUT } from './DraggablePanel';
export type { FieldType } from '@/lib/types';
import { buildEnvelope, elementsOnPage, sortElements } from '@/lib/form-engine';

// ---------------------------------------------------------------------------
// Field type metadata (23 types)
// ---------------------------------------------------------------------------
export interface FieldMeta {
  type: FieldType;
  label: string;
  description: string;
  icon: string;
  category: FieldCategory;
}

export type FieldCategory = 'text' | 'choice' | 'numbers' | 'date-time' | 'media' | 'location' | 'advanced' | 'design';

export const FIELD_CATEGORIES: Array<{ id: FieldCategory; label: string }> = [
  { id: 'text', label: 'Text' },
  { id: 'choice', label: 'Choice' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'date-time', label: 'Date & Time' },
  { id: 'media', label: 'Media' },
  { id: 'location', label: 'Location' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'design', label: 'Design' },
];

export const FIELD_TYPES: FieldMeta[] = [
  { type: 'shorttext', label: 'Short text', description: 'Single-line text input', icon: 'font', category: 'text' },
  { type: 'longtext', label: 'Paragraph', description: 'Multi-line text area', icon: 'align-left', category: 'text' },
  { type: 'email', label: 'Email', description: 'Email address field', icon: 'envelope', category: 'text' },
  { type: 'phone', label: 'Phone', description: 'Phone number field', icon: 'phone', category: 'text' },
  { type: 'dropdown', label: 'Dropdown', description: 'Single selection from list', icon: 'caret-down', category: 'choice' },
  { type: 'multiplechoice', label: 'Multiple choice', description: 'Select multiple options', icon: 'square-check', category: 'choice' },
  { type: 'yesno', label: 'Yes / No', description: 'Binary toggle', icon: 'toggle-on', category: 'choice' },
  { type: 'rating', label: 'Rating', description: 'Star rating scale', icon: 'star', category: 'choice' },
  { type: 'number', label: 'Number', description: 'Numeric input', icon: 'hashtag', category: 'numbers' },
  { type: 'slider', label: 'Slider', description: 'Range slider input', icon: 'sliders', category: 'numbers' },
  { type: 'calculated', label: 'Calculated', description: 'Auto-computed value', icon: 'calculator', category: 'numbers' },
  { type: 'date', label: 'Date', description: 'Date picker', icon: 'calendar', category: 'date-time' },
  { type: 'time', label: 'Time', description: 'Time picker', icon: 'clock', category: 'date-time' },
  { type: 'datetime', label: 'Date & Time', description: 'Date and time picker', icon: 'calendar-clock', category: 'date-time' },
  { type: 'file', label: 'File', description: 'File upload', icon: 'paperclip', category: 'media' },
  { type: 'image', label: 'Image upload', description: 'Image upload field', icon: 'image', category: 'media' },
  { type: 'signature', label: 'Signature', description: 'Signature capture', icon: 'pen-nib', category: 'media' },
  { type: 'location', label: 'Location', description: 'GPS coordinates', icon: 'location-dot', category: 'location' },
  { type: 'prefill', label: 'Prefill', description: 'Auto-filled value', icon: 'wand-magic-sparkles', category: 'advanced' },
  { type: 'matrix', label: 'Matrix', description: 'Grid / table input', icon: 'table-cells', category: 'advanced' },
  { type: 'richtext', label: 'Rich text', description: 'Formatted text block', icon: 'paragraph', category: 'advanced' },
  { type: 'heading', label: 'Heading', description: 'Section heading', icon: 'heading', category: 'design' },
  { type: 'content-image', label: 'Image', description: 'Decorative image', icon: 'image', category: 'design' },
  { type: 'divider', label: 'Divider', description: 'Horizontal line', icon: 'minus', category: 'design' },
  { type: 'spacer', label: 'Spacer', description: 'Vertical space', icon: 'arrows-up-down', category: 'design' },
  { type: 'button', label: 'Button', description: 'Call-to-action link', icon: 'rectangle-ad', category: 'design' },
  { type: 'quote', label: 'Quote', description: 'Blockquote', icon: 'quote-left', category: 'design' },
  { type: 'section', label: 'Section', description: 'Section divider', icon: 'layer-group', category: 'design' },
  { type: 'instructions', label: 'Instructions', description: 'Help text block', icon: 'circle-info', category: 'design' },
  { type: 'container', label: 'Container', description: 'Content wrapper', icon: 'box', category: 'design' },
];

export const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map((f) => [f.type, f])) as Record<FieldType, FieldMeta>;

export const FIELD_TYPE_LABELS: Record<string, string> = Object.fromEntries(FIELD_TYPES.map((f) => [f.type, f.label]));

// ---------------------------------------------------------------------------
// Operators for conditional logic
// ---------------------------------------------------------------------------
export const OPERATORS = [
  { value: 'eq', label: '= equals' },
  { value: 'neq', label: '≠ not equals' },
  { value: 'gt', label: '> greater than' },
  { value: 'lt', label: '< less than' },
  { value: 'gte', label: '≥ at least' },
  { value: 'lte', label: '≤ at most' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'is one of' },
  { value: 'empty', label: 'is empty' },
  { value: 'not-empty', label: 'is not empty' },
] as const;

// ---------------------------------------------------------------------------
// Device presets
// ---------------------------------------------------------------------------
export const DEVICES = {
  desktop: { label: 'Desktop', width: 720, icon: 'desktop' },
  tablet: { label: 'Tablet', width: 560, icon: 'tablet-screen-button' },
  mobile: { label: 'Mobile', width: 400, icon: 'mobile-screen-button' },
} as const;
export type DeviceId = keyof typeof DEVICES;

export const ZOOMS = [1, 0.9, 0.75, 0.6];
export const zoomClass = (z: number) =>
  z === 1 ? '' : z === 0.9 ? 'builder-zoom-90' : z === 0.75 ? 'builder-zoom-75' : 'builder-zoom-60';

// ---------------------------------------------------------------------------
// Unique key generation
// ---------------------------------------------------------------------------
let uidCounter = 0;
export function nextKey(label: string): string {
  uidCounter++;
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field';
  return `${base}_${uidCounter}`;
}

// ---------------------------------------------------------------------------
// Element factory with correct defaults per type
// ---------------------------------------------------------------------------
export function emptyElement(type: FieldType, order: number, pageId = 'page-1'): FormElement {
  const meta = FIELD_TYPE_MAP[type];
  const base: FormElement = {
    key: nextKey(meta?.label ?? type),
    type,
    label: meta?.label ?? type,
    required: false,
    order,
    pageId,
  };
  switch (type) {
    case 'dropdown': case 'multiplechoice': base.options = ['Option 1', 'Option 2']; break;
    case 'number': case 'slider': base.min = 0; base.max = type === 'slider' ? 100 : undefined; break;
    case 'rating': base.min = 1; base.max = 5; base.scoring = { maxPoints: 5 }; break;
    case 'file': case 'image': case 'signature': base.fileMaxCount = 1; base.fileMaxSizeMB = 10; break;
    case 'signature': base.penColor = '#000000'; base.penWidth = 2; base.signatureHeight = 200; break;
    case 'matrix': base.matrixRows = ['Row 1', 'Row 2']; base.matrixColumns = ['Col 1', 'Col 2']; base.matrixScale = 'single'; break;
    case 'calculated': base.formula = ''; base.isReadOnly = true; break;
    case 'prefill': base.prefillSource = 'name'; base.isReadOnly = true; break;
    case 'longtext': base.maxLength = 2000; break;
    case 'shorttext': base.maxLength = 255; break;
    case 'location': base.radiusKm = undefined; break;
    case 'heading': base.headingLevel = 2; break;
    case 'content-image': base.imageFit = 'cover'; base.imageBorderRadius = 8; break;
    case 'divider': base.dividerStyle = 'solid'; base.dividerColor = '#e0e0e0'; break;
    case 'spacer': base.spacerHeight = 40; break;
    case 'button': base.buttonLabel = 'Click me'; base.buttonVariant = 'primary'; break;
    case 'quote': base.quoteContent = 'Quote text…'; break;
    case 'richtext': base.contentHtml = '<p>Rich text content…</p>'; break;
    case 'container': base.containerLayout = { columns: 1, gap: 12, padding: '16px' }; break;
    default: break;
  }
  return base;
}

// ---------------------------------------------------------------------------
// History snapshot type
// ---------------------------------------------------------------------------
interface HistorySnapshot {
  elements: FormElement[];
  pages: FormPage[];
  branding?: FormBranding;
}

// ---------------------------------------------------------------------------
// Autosave status
// ---------------------------------------------------------------------------
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

// ---------------------------------------------------------------------------
// The state hook
// ---------------------------------------------------------------------------
export interface FormBuilderState {
  // Data
  pages: FormPage[];
  elements: FormElement[];
  branding: FormBranding | undefined;
  activePage: string;
  selectedKeys: string[];

  // UI state
  device: DeviceId;
  zoom: number;
  preview: boolean;
  dirty: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  activeDrag: { fromPalette: boolean; type: string } | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftPanelLayout: PanelLayout;
  rightPanelLayout: PanelLayout;

  // Layout & design tools
  layoutGap: number;
  showGrid: boolean;
  showRulers: boolean;
  snapToGrid: boolean;
  gridSize: number;
  copiedStyle: FieldStyle | null;

  // Computed
  pageElements: FormElement[];
  totalPoints: number;
  envelope: FormSchemaEnvelope;
  canUndo: boolean;
  canRedo: boolean;
  activePageTitle: string;

  // Actions — data
  commit: (nextElements: FormElement[], nextPages?: FormPage[], nextBranding?: FormBranding | undefined) => void;
  undo: () => void;
  redo: () => void;
  addElement: (type: FieldType) => void;
  moveElement: (key: string, dir: -1 | 1) => void;
  patchElement: (key: string, patch: Partial<FormElement>) => void;
  patchSelected: (patch: Partial<FormElement>) => void;
  moveElementTo: (key: string, x: number, y: number) => void;
  deleteKeys: (keys: string[]) => void;
  duplicateKeys: (keys: string[]) => void;
  copySelected: () => void;
  pasteClipboard: () => string[];

  // Actions — pages
  addPage: () => void;
  deletePage: (id: string) => void;
  renamePage: (id: string, title: string) => void;
  setActivePage: (id: string) => void;

  // Actions — selection
  setSelection: (keys: string[]) => void;
  handleCanvasClick: (key: string, e: React.MouseEvent<HTMLElement>) => void;
  selectAll: () => void;
  deselectAll: () => void;

  // Actions — UI
  setDevice: (d: DeviceId) => void;
  setZoom: (z: number) => void;
  setPreview: (p: boolean) => void;
  setActiveDrag: (d: { fromPalette: boolean; type: string } | null) => void;
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setLeftPanelLayout: (layout: PanelLayout) => void;
  setRightPanelLayout: (layout: PanelLayout) => void;
  setDirty: (d: boolean) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setLastSavedAt: (t: number | null) => void;
  setBranding: (b: FormBranding | undefined) => void;

  // Actions — layout & design tools
  setLayoutGap: (g: number) => void;
  setShowGrid: (show: boolean) => void;
  setShowRulers: (show: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  setGridSize: (size: number) => void;
  copyStyle: (el: FormElement) => void;
  pasteStyle: (key: string) => void;
  pasteStyleToSelected: () => void;

  // Refs
  clipboardRef: React.MutableRefObject<FormElement[] | null>;
}

export function useFormBuilderState(
  initial: FormSchemaEnvelope,
  onChange: (envelope: FormSchemaEnvelope) => void,
  onDirtyChange?: (dirty: boolean) => void,
  dirtyResetSignal?: number,
): FormBuilderState {
  const [pages, setPages] = useState<FormPage[]>(initial.pages?.length ? initial.pages : [{ id: 'page-1', title: 'Page 1' }]);
  const [elements, setElements] = useState<FormElement[]>(sortElements(initial.elements ?? []));
  const [branding, setBrandingState] = useState<FormBranding | undefined>(initial.branding);
  const [activePage, setActivePageRaw] = useState(pages[0]?.id ?? 'page-1');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [device, setDevice] = useState<DeviceId>('desktop');
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ fromPalette: boolean; type: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftPanelLayout, setLeftPanelLayout] = useState<PanelLayout>(DEFAULT_LEFT_LAYOUT);
  const [rightPanelLayout, setRightPanelLayout] = useState<PanelLayout>(DEFAULT_RIGHT_LAYOUT);
  const clipboardRef = useRef<FormElement[] | null>(null);

  // Layout & design tools
  const [layoutGap, setLayoutGap] = useState(12);
  const [showGrid, setShowGrid] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(20);
  const copiedStyleRef = useRef<FieldStyle | null>(null);
  const [copiedStyle, setCopiedStyle] = useState<FieldStyle | null>(null);

  // --- Dirty propagation ---
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (dirtyResetSignal !== undefined && dirtyResetSignal > 0) setDirty(false);
  }, [dirtyResetSignal]);

  // --- Computed ---
  const pageElements = useMemo(() => elementsOnPage(elements, activePage), [elements, activePage]);

  const totalPoints = useMemo(() => {
    return elements.reduce((sum, e) => {
      if (!e.scoring) return sum;
      if (e.scoring.maxPoints !== undefined) return sum + e.scoring.maxPoints;
      if (e.scoring.optionPoints) {
        const vals = Object.values(e.scoring.optionPoints);
        return sum + (vals.length ? Math.max(...vals) : 0);
      }
      if (e.type === 'number' || e.type === 'slider' || e.type === 'rating') return sum + (e.max ?? 100);
      if (e.type === 'multiplechoice' && e.options && e.maxSelections) return sum + e.maxSelections;
      return sum + 1;
    }, 0);
  }, [elements]);

  const envelope = useMemo(() => buildEnvelope(elements, branding, pages), [elements, branding, pages]);
  const canUndo = history.length > 0;
  const canRedo = redoStack.length > 0;
  const activePageTitle = useMemo(() => pages.find((p) => p.id === activePage)?.title ?? 'Untitled page', [pages, activePage]);

  // --- Core commit (snapshot for undo) ---
  const commit = useCallback((nextElements: FormElement[], nextPages: FormPage[] = pages, nextBranding: FormBranding | undefined = branding) => {
    const ordered = nextElements.map((e, i) => ({ ...e, order: i }));
    setHistory((h) => [...h.slice(-49), { elements, pages, branding }]);
    setRedoStack([]);
    setElements(ordered);
    setPages(nextPages);
    setBrandingState(nextBranding);
    setDirty(true);
    setSaveStatus('unsaved');
    onChange(buildEnvelope(ordered, nextBranding, nextPages));
  }, [elements, pages, branding, onChange]);

  // --- Undo / Redo ---
  const undo = useCallback(() => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      setRedoStack((r) => [...r.slice(-49), { elements, pages, branding }]);
      setElements(prev.elements);
      setPages(prev.pages);
      setBrandingState(prev.branding);
      setDirty(true);
      setSaveStatus('unsaved');
      onChange(buildEnvelope(prev.elements, prev.branding, prev.pages));
      return h.slice(0, -1);
    });
  }, [elements, pages, branding, onChange]);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      const next = r[r.length - 1];
      if (!next) return r;
      setHistory((h) => [...h.slice(-49), { elements, pages, branding }]);
      setElements(next.elements);
      setPages(next.pages);
      setBrandingState(next.branding);
      setDirty(true);
      setSaveStatus('unsaved');
      onChange(buildEnvelope(next.elements, next.branding, next.pages));
      return r.slice(0, -1);
    });
  }, [elements, pages, branding, onChange]);

  // --- Element CRUD ---
  const addElement = useCallback((type: FieldType) => {
    const pageOrder = elementsOnPage(elements, activePage).length;
    const insertAt = elements.findIndex((e) => (e.pageId ?? 'page-1') === activePage);
    const idx = insertAt === -1 ? elements.length : insertAt + pageOrder;
    const next = [...elements];
    next.splice(idx, 0, emptyElement(type, idx, activePage));
    commit(next);
    setSelectedKeys([next[idx].key]);
  }, [elements, activePage, commit]);

  const moveElement = useCallback((key: string, dir: -1 | 1) => {
    const pageList = [...elementsOnPage(elements, activePage)];
    const i = pageList.findIndex((e) => e.key === key);
    const t = i + dir;
    if (t < 0 || t >= pageList.length) return;
    [pageList[i], pageList[t]] = [pageList[t], pageList[i]];
    const others = elements.filter((e) => (e.pageId ?? 'page-1') !== activePage);
    commit([...others, ...pageList]);
  }, [elements, activePage, commit]);

  const patchElement = useCallback((key: string, patch: Partial<FormElement>) => {
    // Strip undefined values from style so CSS class defaults can take over
    let cleanPatch = patch;
    if (patch.style) {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch.style)) {
        if (v !== undefined && v !== null && v !== '') cleaned[k] = v;
      }
      cleanPatch = { ...patch, style: cleaned as FormElement['style'] };
    }
    const next = elements.map((e) => (e.key === key ? { ...e, ...cleanPatch } : e));
    commit(next);
    if (patch.key && patch.key !== key) {
      setSelectedKeys((prev) => prev.map((k) => (k === key ? patch.key! : k)));
    }
  }, [elements, commit]);

  const patchSelected = useCallback((patch: Partial<FormElement>) => {
    if (!selectedKeys.length) return;
    patchElement(selectedKeys[0], patch);
  }, [selectedKeys, patchElement]);

  const moveElementTo = useCallback((key: string, x: number, y: number) => {
    const next = elements.map((e) => (e.key === key ? { ...e, x, y } : e));
    commit(next);
  }, [elements, commit]);

  const deleteKeys = useCallback((keys: string[]) => {
    const set = new Set(keys);
    if (!set.size) return;
    commit(elements.filter((e) => !set.has(e.key)));
    setSelectedKeys((prev) => prev.filter((k) => !set.has(k)));
  }, [elements, commit]);

  const duplicateKeys = useCallback((keys: string[]) => {
    const idxs = keys.map((k) => elements.findIndex((e) => e.key === k)).filter((i) => i !== -1).sort((a, b) => a - b);
    if (!idxs.length) return;
    const next = [...elements];
    const newKeys: string[] = [];
    let shift = 0;
    for (const idx of idxs) {
      const src = next[idx + shift];
      const clone = { ...structuredClone(src), key: nextKey(src.type), order: 0 };
      next.splice(idx + shift + 1, 0, clone);
      newKeys.push(clone.key);
      shift++;
    }
    commit(next);
    setSelectedKeys(newKeys);
  }, [elements, commit]);

  const copySelected = useCallback(() => {
    const items = elements.filter((e) => selectedKeys.includes(e.key));
    if (!items.length) return;
    clipboardRef.current = items.map((e) => structuredClone(e));
    void navigator.clipboard?.writeText(JSON.stringify(items.map(({ order, ...rest }) => rest))).catch(() => undefined);
  }, [elements, selectedKeys]);

  const pasteClipboard = useCallback((): string[] => {
    const items = clipboardRef.current;
    if (!items || !items.length) return [];
    const clones = items.map((el) => ({ ...structuredClone(el), key: nextKey(el.type), order: 0 }));
    const selIdx = selectedKeys.map((k) => elements.findIndex((e) => e.key === k)).filter((i) => i !== -1);
    const anchor = selIdx.length ? Math.max(...selIdx) : elements.length;
    const next = [...elements];
    next.splice(anchor + 1, 0, ...clones);
    commit(next);
    setSelectedKeys(clones.map((c) => c.key));
    return clones.map((c) => c.key);
  }, [elements, selectedKeys, commit]);

  // --- Page management ---
  const addPage = useCallback(() => {
    const id = `page-${pages.length + 1}`;
    const nextPages = [...pages, { id, title: `Page ${pages.length + 1}` }];
    commit(elements, nextPages, branding);
    setActivePageRaw(id);
    setSelectedKeys([]);
  }, [elements, pages, branding, commit]);

  const deletePage = useCallback((id: string) => {
    if (pages.length <= 1) return;
    const nextPages = pages.filter((p) => p.id !== id);
    const next = elements.map((e) => ((e.pageId ?? 'page-1') === id ? { ...e, pageId: nextPages[0].id } : e));
    commit(next, nextPages, branding);
    if (activePage === id) setActivePageRaw(nextPages[0].id);
  }, [elements, pages, branding, activePage, commit]);

  const renamePage = useCallback((id: string, title: string) => {
    commit(elements, pages.map((p) => (p.id === id ? { ...p, title } : p)), branding);
  }, [elements, pages, branding, commit]);

  const setActivePage = useCallback((id: string) => {
    setActivePageRaw(id);
    setSelectedKeys([]);
  }, []);

  // --- Selection ---
  const setSelection = useCallback((keys: string[]) => setSelectedKeys(keys), []);

  const handleCanvasClick = useCallback((key: string, e: React.MouseEvent<HTMLElement>) => {
    if (e.shiftKey) {
      const order = pageElements.map((x) => x.key);
      const last = selectedKeys.length ? selectedKeys[selectedKeys.length - 1] : key;
      const from = order.indexOf(last);
      const to = order.indexOf(key);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        setSelectedKeys(order.slice(lo, hi + 1));
        return;
      }
      setSelectedKeys([key]);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
      return;
    }
    setSelectedKeys([key]);
  }, [pageElements, selectedKeys]);

  const selectAll = useCallback(() => {
    setSelectedKeys(pageElements.map((e) => e.key));
  }, [pageElements]);

  const deselectAll = useCallback(() => setSelectedKeys([]), []);

  // --- Branding (committed through commit for undo support) ---
  const setBranding = useCallback((b: FormBranding | undefined) => {
    setBrandingState(b);
  }, []);

  // --- Layout & design tools ---
  const copyStyle = useCallback((el: FormElement) => {
    const style = el.style ? { ...el.style } : null;
    copiedStyleRef.current = style;
    setCopiedStyle(style);
  }, []);

  const pasteStyle = useCallback((key: string) => {
    if (!copiedStyleRef.current) return;
    patchElement(key, { style: { ...copiedStyleRef.current } });
  }, [patchElement]);

  const pasteStyleToSelected = useCallback(() => {
    if (!copiedStyleRef.current || selectedKeys.length === 0) return;
    for (const key of selectedKeys) {
      patchElement(key, { style: { ...copiedStyleRef.current } });
    }
  }, [selectedKeys, patchElement]);

  return {
    pages, elements, branding, activePage, selectedKeys,
    device, zoom, preview, dirty, saveStatus, lastSavedAt, activeDrag,
    leftPanelOpen, rightPanelOpen, leftPanelLayout, rightPanelLayout,
    layoutGap, showGrid, showRulers, snapToGrid, gridSize, copiedStyle,
    pageElements, totalPoints, envelope, canUndo, canRedo, activePageTitle,
    commit, undo, redo, addElement, moveElement, patchElement, patchSelected, moveElementTo,
    deleteKeys, duplicateKeys, copySelected, pasteClipboard,
    addPage, deletePage, renamePage, setActivePage,
    setSelection, handleCanvasClick, selectAll, deselectAll,
    setDevice, setZoom, setPreview, setActiveDrag,
    setLeftPanelOpen, setRightPanelOpen, setLeftPanelLayout, setRightPanelLayout, setDirty, setSaveStatus, setLastSavedAt,
    setBranding,
    setLayoutGap, setShowGrid, setShowRulers, setSnapToGrid, setGridSize,
    copyStyle, pasteStyle, pasteStyleToSelected,
    clipboardRef,
  };
}
