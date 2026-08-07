export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('kgmis_token');
}

export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('kgmis_token', token);
  }
}

export function clearToken(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('kgmis_token');
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code = 'HTTP_ERROR';
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      if (data.message) message = data.message;
      if (data.error) code = data.error;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export interface LoginResult {
  token: string;
  user: { userId: number; cuasId: string; name: string; email?: string | null; role: string };
}

export async function localLogin(username: string, password: string): Promise<LoginResult> {
  return api.post<LoginResult>('/api/v1/auth/login/local', { username, password });
}

export async function fetchMe(): Promise<{ user: { userId: number; cuasId: string; name: string; role: string } }> {
  return api.get('/api/v1/auth/me');
}
