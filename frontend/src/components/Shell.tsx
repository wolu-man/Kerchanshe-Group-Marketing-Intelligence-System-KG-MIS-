'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { GlobalAiLauncher } from './GlobalAiLauncher';
import { FirstRunPrompt } from './tour/FirstRunPrompt';
import { Icon } from '@/components/ui';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import { AiPageContextProvider } from '@/lib/ai-context';
import { api } from '@/lib/api';

function UserAvatar({ src, name, size = 32 }: { src?: string | null; name: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.375, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setDark(localStorage.getItem('kgmis_theme') === 'dark');
      setCollapsed(localStorage.getItem('kgmis_sidebar_collapsed') === '1');
    } catch { /* noop */ }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('kgmis_sidebar_collapsed', next ? '1' : '0'); } catch { /* noop */ }
  };

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem('kgmis_theme', next ? 'dark' : 'light');
    } catch { /* noop */ }
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    toast.info(next ? 'Dark mode enabled' : 'Light mode enabled');
  };

  useEffect(() => {
    if (!user) return;
    const fetchCount = () =>
      api<{ count: number }>('/notifications/unread-count')
        .then((r) => setUnread(r.count))
        .catch(() => undefined);
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [user]);

  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:4000'}${user.profilePhoto}`)
    : null;

  return (
    <div className="shell">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className={`main ${collapsed ? 'expanded' : ''}`}>
        <header className="topbar">
          <button className="menu-btn" onClick={() => {
            if (window.innerWidth <= 900) setMobileOpen((v) => !v);
            else toggleCollapsed();
          }} aria-label="Toggle menu" title="Toggle sidebar">
            <Icon name="bars" />
          </button>
          <div className="spacer" />
          {user ? (
            <>
              <span className="role-pill">{user.role}</span>
              <button className="theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
                <Icon name={dark ? 'sun' : 'moon'} />
              </button>
              <Link href="/notifications" className="bell" aria-label="Notifications">
                <Icon name="bell" />
                {unread > 0 ? <span className="dot">{unread > 99 ? '99+' : unread}</span> : null}
              </Link>
              <div className="topbar-user-menu" ref={menuRef}>
                <button className="topbar-user-btn" onClick={() => setMenuOpen((v) => !v)}>
                  <UserAvatar src={photoUrl} name={user.name} size={32} />
                  <span className="topbar-user-name">{user.name}</span>
                  <Icon name="chevron-down" />
                </button>
                {menuOpen && (
                  <div className="topbar-dropdown">
                    <button className="topbar-dropdown-item" onClick={() => { setMenuOpen(false); router.push('/profile'); }}>
                      <Icon name="user" /> Profile
                    </button>
                    <div className="topbar-dropdown-divider" />
                    <button className="topbar-dropdown-item danger" onClick={() => { setMenuOpen(false); logout(); window.location.href = '/login'; }}>
                      <Icon name="right-from-bracket" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </header>
        <AiPageContextProvider>
          <main className="content">{children}</main>
          <GlobalAiLauncher />
          <FirstRunPrompt />
        </AiPageContextProvider>
      </div>
    </div>
  );
}
