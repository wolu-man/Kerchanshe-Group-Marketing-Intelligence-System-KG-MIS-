'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';

// System-wide toast notifications. The emitter is module-level so it can be
// fired from anywhere (event handlers, api wrappers) without React context.
// The provider below subscribes to the emitter and renders the viewport.
// Toast nodes carry `alert alert-success`-style classes too so existing
// QA/inline selectors keep working.

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: React.ReactNode;
  duration: number;
}

type ToastListener = () => void;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<ToastListener>();

const ICONS: Record<ToastKind, string> = {
  success: 'circle-check',
  error: 'circle-xmark',
  info: 'circle-info',
  warning: 'triangle-exclamation',
};

const DEFAULTS: Record<ToastKind, number> = {
  success: 3000,
  error: 5000,
  info: 3500,
  warning: 4000,
};

const KIND_ALERT: Record<ToastKind, string> = {
  success: 'alert-success',
  error: 'alert-error',
  info: 'alert-info',
  warning: 'alert-warning',
};

function emit() {
  listeners.forEach((l) => l());
}

export function showToast(kind: ToastKind, message: React.ReactNode, duration?: number): number {
  const d = duration ?? DEFAULTS[kind];
  const existing = items.find((t) => t.kind === kind && t.message === message);
  if (existing) {
    items = items.map((t) => (t.id === existing.id ? { ...t, duration: d } : t));
    emit();
    return existing.id;
  }
  const id = ++seq;
  items = [...items, { id, kind, message, duration: d }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message: React.ReactNode, duration?: number) => showToast('success', message, duration),
  error: (message: React.ReactNode, duration?: number) => showToast('error', message, duration),
  info: (message: React.ReactNode, duration?: number) => showToast('info', message, duration),
  warning: (message: React.ReactNode, duration?: number) => showToast('warning', message, duration),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const update = () => setVisible([...items]);
    listeners.add(update);
    update();
    return () => { listeners.delete(update); };
  }, []);

  useEffect(() => {
    const seen = new Set<number>();
    for (const t of visible) {
      seen.add(t.id);
      const existing = timers.current.get(t.id);
      if (existing !== undefined) {
        clearTimeout(existing);
      }
      timers.current.set(t.id, setTimeout(() => dismissToast(t.id), t.duration));
    }
    for (const id of timers.current.keys()) {
      if (!seen.has(id)) {
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
      }
    }
  }, [visible]);

  function dismiss(id: number) {
    timers.current.delete(id);
    dismissToast(id);
  }

return (
    <>
      <div className="toast-viewport" aria-live="polite" aria-atomic="false">
        {visible.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind} alert ${KIND_ALERT[t.kind]}`}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            <span className="toast-icon"><Icon name={ICONS[t.kind]} /></span>
            <div className="toast-body">{t.message}</div>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <Icon name="xmark" />
            </button>
          </div>
        ))}
      </div>
      {children}
    </>
  );
}
