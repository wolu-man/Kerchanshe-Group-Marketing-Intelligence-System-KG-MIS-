'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken } from './api';
import type { AuthUser } from './types';

const TOKEN_KEY = 'kgmis_token';
const USER_KEY = 'kgmis_user';

interface AuthContextValue {
  loading: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  updateProfile: (data: { name?: string; email?: string }) => Promise<void>;
  changePassword: (data: { currentPassword: string; newPassword: string }) => Promise<void>;
  uploadPhoto: (file: File) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    setToken(token);
    api<{ user: AuthUser }>('/auth/me')
      .then((r) => {
        setUser(r.user);
        persistUser(r.user);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
    };
    window.addEventListener('kgmis:unauthorized', onUnauthorized);
    return () => window.removeEventListener('kgmis:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<{ token: string; user: AuthUser }>('/auth/login/local', {
      method: 'POST',
      body: { username, password },
    });
    setToken(res.token);
    localStorage.setItem(TOKEN_KEY, res.token);
    persistUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (data: { name?: string; email?: string }) => {
    const res = await api<{ user: AuthUser; token: string }>('/auth/profile', { method: 'PUT', body: data });
    setToken(res.token);
    localStorage.setItem(TOKEN_KEY, res.token);
    persistUser(res.user);
    setUser(res.user);
  }, []);

  const changePassword = useCallback(async (data: { currentPassword: string; newPassword: string }) => {
    await api<{ ok: boolean }>('/auth/password', { method: 'PUT', body: data });
  }, []);

  const uploadPhoto = useCallback(async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api<{ profilePhoto: string; user: AuthUser; token: string }>('/auth/photo', { method: 'POST', body: fd, json: false });
    setToken(res.token);
    localStorage.setItem(TOKEN_KEY, res.token);
    persistUser(res.user);
    setUser(res.user);
    return res.profilePhoto;
  }, []);

  const value = useMemo(() => ({ loading, user, login, logout, updateProfile, changePassword, uploadPhoto }), [loading, user, login, logout, updateProfile, changePassword, uploadPhoto]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useRole(): string | null {
  return useAuth().user?.role ?? null;
}
