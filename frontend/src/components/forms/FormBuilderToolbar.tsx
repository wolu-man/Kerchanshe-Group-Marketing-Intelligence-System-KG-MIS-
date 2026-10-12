'use client';

import Link from 'next/link';
import { Button, Icon } from '@/components/ui';
import { AiWaves } from '@/components/AiWaves';
import { DEVICES, type DeviceId, ZOOMS, type SaveStatus } from './FormBuilderState';

function formatLastSaved(ts: number | null): string {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function FormBuilderToolbar({
  formTitle,
  formStatus,
  formVersion,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  dirty,
  saveStatus,
  lastSavedAt,
  onPreview,
  device,
  onDeviceChange,
  zoom,
  onZoomChange,
  elementsCount,
  totalPoints,
  preview,
  onClosePreview,
  leftPanelOpen,
  onToggleLeftPanel,
  rightPanelOpen,
  onToggleRightPanel,
  showRulers,
  onToggleRulers,
  showGrid,
  onToggleGrid,
  snapToGrid,
  onToggleSnap,
  aiOpen,
  onToggleAi,
}: {
  formTitle: string;
  formStatus?: string;
  formVersion?: number | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  dirty: boolean;
  saveStatus?: SaveStatus;
  lastSavedAt?: number | null;
  onPreview: () => void;
  device: DeviceId;
  onDeviceChange: (d: DeviceId) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  elementsCount: number;
  totalPoints: number;
  preview: boolean;
  onClosePreview: () => void;
  leftPanelOpen: boolean;
  onToggleLeftPanel: () => void;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  showRulers?: boolean;
  onToggleRulers?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  snapToGrid?: boolean;
  onToggleSnap?: () => void;
  aiOpen?: boolean;
  onToggleAi?: () => void;
}) {
  if (preview) {
    return (
      <div className="btoolbar">
        <div className="btoolbar-left">
          <Button variant="ghost" size="sm" onClick={onClosePreview}>
            <Icon name="arrow-left" /> Back to builder
          </Button>
          <div className="btoolbar-divider" />
          <span className="btoolbar-title">{formTitle}</span>
        </div>
        <div className="btoolbar-center">
          <span className="btoolbar-hint">Live preview of current draft</span>
        </div>
        <div className="btoolbar-right">
          <div className="seg" title="Canvas width">
            {(Object.keys(DEVICES) as DeviceId[]).map((d) => (
              <button key={d} className={device === d ? 'active' : ''} onClick={() => onDeviceChange(d)} aria-label={DEVICES[d].label}>
                <Icon name={DEVICES[d].icon} />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="btoolbar">
      <div className="btoolbar-left">
        <Link href="/forms" className="btoolbar-back" title="Back to Forms">
          <Icon name="arrow-left" />
        </Link>
        <div className="btoolbar-divider" />
        <div className="btoolbar-form-info">
          <span className="btoolbar-form-name">{formTitle}</span>
          <span className="btoolbar-form-meta">
            {formStatus && <span className="btoolbar-status">{formStatus}</span>}
            {formVersion ? <span className="btoolbar-version">v{formVersion}</span> : null}
          </span>
        </div>
      </div>

      <div className="btoolbar-center">
        <button
          className="btoolbar-action"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Icon name="rotate-left" />
        </button>
        <button
          className="btoolbar-action"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Icon name="rotate-right" />
        </button>
      </div>

      <div className="btoolbar-right">
        <span className="btoolbar-fields-count">
          {elementsCount} field{elementsCount === 1 ? '' : 's'}
          {totalPoints ? ` · ${totalPoints} pts` : ''}
        </span>

        {saveStatus === 'saving' ? (
          <span className="btoolbar-save saving">
            <Icon name="spinner" /> Saving…
          </span>
        ) : dirty ? (
          <span className="btoolbar-save unsaved">
            <Icon name="circle-exclamation" /> Unsaved
          </span>
        ) : (
          <span className="btoolbar-save saved">
            <Icon name="circle-check" /> Saved {lastSavedAt ? formatLastSaved(lastSavedAt) : ''}
          </span>
        )}

        <div className="btoolbar-divider" />

        <button className="btoolbar-panel-toggle" onClick={onToggleLeftPanel} title="Toggle elements panel" aria-label="Toggle elements panel">
          <Icon name="table-columns" />
        </button>
        <button className="btoolbar-panel-toggle" onClick={onToggleRightPanel} title="Toggle properties panel" aria-label="Toggle properties panel">
          <Icon name="sliders" />
        </button>

        <div className="btoolbar-divider" />

        {onToggleRulers && (
          <button className={`btoolbar-panel-toggle ${showRulers ? 'active' : ''}`} onClick={onToggleRulers} title="Toggle rulers" aria-label="Toggle rulers">
            <Icon name="ruler" />
          </button>
        )}
        {onToggleGrid && (
          <button className={`btoolbar-panel-toggle ${showGrid ? 'active' : ''}`} onClick={onToggleGrid} title="Toggle grid" aria-label="Toggle grid">
            <Icon name="border-all" />
          </button>
        )}
        {onToggleSnap && (
          <button className={`btoolbar-panel-toggle ${snapToGrid ? 'active' : ''}`} onClick={onToggleSnap} title="Snap to grid" aria-label="Snap to grid">
            <Icon name="magnet" />
          </button>
        )}

        <div className="btoolbar-divider" />

        <div className="seg" title="Canvas width">
          {(Object.keys(DEVICES) as DeviceId[]).map((d) => (
            <button key={d} className={device === d ? 'active' : ''} onClick={() => onDeviceChange(d)} aria-label={DEVICES[d].label} title={DEVICES[d].label}>
              <Icon name={DEVICES[d].icon} />
            </button>
          ))}
        </div>

        <select
          className="select btoolbar-zoom"
          value={String(zoom)}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          aria-label="Zoom"
        >
          {ZOOMS.map((z) => <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>)}
        </select>

        {onToggleAi && (
          <button
            className={`btoolbar-panel-toggle ai-orb ${aiOpen ? 'active' : ''}`}
            onClick={onToggleAi}
            title="AI Form Assistant"
            aria-label="Toggle AI Form Assistant"
            aria-pressed={aiOpen}
          >
            <AiWaves />
            <Icon name="wand-magic-sparkles" />
          </button>
        )}

        <Button size="sm" variant="ghost" onClick={onPreview} title="Preview form">
          <Icon name="eye" /> Preview
        </Button>
      </div>
    </div>
  );
}
