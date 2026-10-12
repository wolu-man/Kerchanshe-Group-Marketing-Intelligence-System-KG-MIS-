'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

export interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [500, 1000, 2000];

/** Declarative fetch wrapper: reloads when the key/path changes. Retries on failure. Pass null to disable. */
export function useFetch<T>(path: string | null, deps: unknown[] = []): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pathRef = useRef(path);
  pathRef.current = path;
  const retryCountRef = useRef(0);

  const reload = useCallback(async () => {
    if (!pathRef.current) { setLoading(false); return; }
    setError(null);
    retryCountRef.current = 0;

    const attempt = async (retriesLeft: number): Promise<void> => {
      try {
        const res = await api<T>(pathRef.current!);
        setData(res);
        retryCountRef.current = 0;
      } catch (err) {
        if (retriesLeft > 0 && err instanceof ApiError && err.status >= 500) {
          const delay = RETRY_DELAY_MS[MAX_RETRIES - retriesLeft] || 2000;
          await new Promise(r => setTimeout(r, delay));
          return attempt(retriesLeft - 1);
        }
        setError(err instanceof ApiError ? err.message : 'Request failed');
      }
    };

    try {
      await attempt(MAX_RETRIES);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Mutation helper returning an error string or null on success. */
export async function runMutation<T = unknown>(path: string, body: unknown): Promise<{ ok: boolean; error: string | null; data?: T }> {
  try {
    const data = await api<T>(path, { method: 'POST', body });
    return { ok: true, error: null, data };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Request failed' };
  }
}

export async function runPut<T = unknown>(path: string, body: unknown): Promise<{ ok: boolean; error: string | null; data?: T }> {
  try {
    const data = await api<T>(path, { method: 'PUT', body });
    return { ok: true, error: null, data };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Request failed' };
  }
}

export async function runDelete<T = unknown>(path: string): Promise<{ ok: boolean; error: string | null; data?: T }> {
  try {
    const data = await api<T>(path, { method: 'DELETE' });
    return { ok: true, error: null, data };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Request failed' };
  }
}
