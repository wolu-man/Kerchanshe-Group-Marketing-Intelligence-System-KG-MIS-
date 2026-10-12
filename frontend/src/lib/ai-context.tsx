'use client';

// =============================================================================
// Page context for the global AI assistant (KG-MIS AI).
//
// The current module is derived automatically from the URL — zero page wiring
// needed. Pages that want richer context (record label, filters) can call
// useSetAiPageContext(); overrides reset on navigation. The context is
// advisory: it is sent with /ai/ask and only helps the model interpret the
// question — it never changes permissions or data access.
// =============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

export interface AiContextFilter {
  k: string;
  v: string;
}

export interface AiPageContext {
  module: string;
  label?: string;
  recordId?: number;
  filters?: AiContextFilter[];
}

const ROUTE_MODULES: Array<[RegExp, string]> = [
  [/^\/dashboard/, 'dashboard'],
  [/^\/notifications/, 'notifications'],
  [/^\/visits/, 'marketVisits'],
  [/^\/interviews/, 'interviews'],
  [/^\/multimedia/, 'multimedia'],
  [/^\/forms/, 'forms'],
  [/^\/tenders/, 'tenders'],
  [/^\/pricing/, 'pricing'],
  [/^\/weekly-sales/, 'weeklySales'],
  [/^\/officer/, 'performance'],
  [/^\/reports/, 'reports'],
  [/^\/admin/, 'admin'],
  [/^\/profile/, 'profile'],
];

export function deriveAiPageContext(pathname: string): AiPageContext {
  const mod = ROUTE_MODULES.find(([re]) => re.test(pathname))?.[1] ?? 'general';
  const record = pathname.match(/^\/forms\/(\d+)/) ?? pathname.match(/^\/tenders\/(\d+)/);
  return record ? { module: mod, recordId: Number(record[1]) } : { module: mod };
}

interface AiPageContextState {
  page: AiPageContext;
  setPageContext: (patch: Partial<AiPageContext> | null) => void;
}

const AiPageContextStateCtx = createContext<AiPageContextState | null>(null);

export function AiPageContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [override, setOverride] = useState<Partial<AiPageContext>>({});

  useEffect(() => {
    setOverride({});
  }, [pathname]);

  const derived = useMemo(() => deriveAiPageContext(pathname), [pathname]);
  const page = useMemo<AiPageContext>(
    () => ({ ...derived, ...override, module: override.module ?? derived.module }),
    [derived, override]
  );

  const setPageContext = useCallback((patch: Partial<AiPageContext> | null) => {
    setOverride((prev) => (patch === null ? {} : { ...prev, ...patch }));
  }, []);

  const value = useMemo(() => ({ page, setPageContext }), [page, setPageContext]);
  return <AiPageContextStateCtx.Provider value={value}>{children}</AiPageContextStateCtx.Provider>;
}

export function useAiPageContext(): AiPageContext {
  const ctx = useContext(AiPageContextStateCtx);
  const pathname = usePathname();
  const derived = useMemo(() => deriveAiPageContext(pathname), [pathname]);
  return ctx ? ctx.page : derived;
}

export function useSetAiPageContext(): (patch: Partial<AiPageContext> | null) => void {
  const ctx = useContext(AiPageContextStateCtx);
  return ctx ? ctx.setPageContext : () => undefined;
}
