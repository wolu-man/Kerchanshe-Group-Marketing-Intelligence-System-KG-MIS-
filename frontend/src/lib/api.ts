'use client';

// Thin typed fetch client for the MIS API. The JWT is stored in
// localStorage and injected on every request. 401 responses clear the session.

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let cachedToken: string | null = null;

export function setToken(token: string | null): void {
  cachedToken = token;
}

export function getToken(): string | null {
  return cachedToken;
}

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

export function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function api<T>(path: string, opts: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string | null;
  json?: boolean;
} = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const token = opts.token !== undefined ? opts.token : cachedToken;
  if (token) headers.Authorization = `Bearer ${token}`;
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (!isFormData && opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? (isFormData ? opts.body as FormData : JSON.stringify(opts.body)) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API server');
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const e = (json as { error?: string; message?: string; details?: unknown }) ?? {};
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kgmis:unauthorized'));
    }
    throw new ApiError(res.status, e.error ?? 'ERROR', e.message ?? res.statusText, e.details);
  }

  return json as T;
}

export async function apiBlob(path: string, opts: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string | null;
} = {}): Promise<Blob> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const token = opts.token !== undefined ? opts.token : cachedToken;
  if (token) headers.Authorization = `Bearer ${token}`;
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (!isFormData && opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? (isFormData ? opts.body as FormData : JSON.stringify(opts.body)) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API server');
  }

  if (!res.ok) {
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const e = (json as { error?: string; message?: string; details?: unknown }) ?? {};
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kgmis:unauthorized'));
    }
    throw new ApiError(res.status, e.error ?? 'ERROR', e.message ?? res.statusText, e.details);
  }

  return res.blob();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function downloadFile(blob: Blob, filename: string) {
  downloadBlob(blob, filename);
}
