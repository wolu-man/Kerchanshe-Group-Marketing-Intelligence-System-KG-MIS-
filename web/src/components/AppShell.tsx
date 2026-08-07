'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearToken } from '@/lib/api';
import type { User } from '@/lib/types';

const ROLE_MENU: Record<string, string[]> = {
  Administrator: ['dashboard', 'visits', 'surveys', 'pricing', 'reports', 'admin'],
  'Marketing Manager': ['dashboard', 'visits', 'surveys', 'pricing', 'reports'],
  'Marketing Analyst': ['dashboard', 'visits', 'surveys', 'pricing', 'reports'],
  'Field Officer': ['dashboard', 'visits', 'surveys', 'pricing'],
  Viewer: ['dashboard', 'reports'],
};

const NAV: Array<{ key: string; href: string; label: string }> = [
  { key: 'dashboard', href: '/', label: 'Dashboard' },
  { key: 'visits', href: '/market-visits', label: 'Market Visits' },
  { key: 'surveys', href: '/surveys', label: 'Surveys' },
  { key: 'pricing', href: '/pricing', label: 'Competitor Pricing' },
  { key: 'reports', href: '/reports', label: 'Reports' },
  { key: 'admin', href: '/admin/sync', label: 'Administration' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem('kgmis_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    api
      .get<{ user: User }>('/api/v1/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => {
        clearToken();
        router.replace('/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading || !user) {
    return <div className="login-wrap">Loading...</div>;
  }

  const menuKeys = ROLE_MENU[user.role] ?? ['dashboard'];
  const navItems = NAV.filter((n) => menuKeys.includes(n.key));

  function logout() {
    api.post('/api/v1/auth/logout').catch(() => undefined);
    clearToken();
    router.replace('/login');
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">KG Market Intelligence</div>
        <nav>
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)) ? 'active' : ''}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="user">
          <div>
            <strong>{user.name}</strong>
          </div>
          <div className="muted">{user.role}</div>
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
