'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/ui';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: string[];
}

export const NAV_SECTIONS: Array<{ title: string; icon: string; items: NavItem[] }> = [
  {
    title: 'Overview',
    icon: 'gauge-high',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'gauge-high', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/notifications', label: 'Notifications', icon: 'bell', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
    ],
  },
  {
    title: 'Field intelligence',
    icon: 'binoculars',
    items: [
      { href: '/visits', label: 'Market visits', icon: 'location-dot', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer'] },
      { href: '/interviews', label: 'Interviews', icon: 'comments', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/multimedia', label: 'Photos & videos', icon: 'photo-film', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/forms', label: 'Forms & surveys', icon: 'clipboard-list', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/pricing', label: 'Competitor pricing', icon: 'money-bill-trend-up', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer'] },
      { href: '/weekly-sales', label: 'Weekly sales', icon: 'cash-register', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/officer/performance', label: 'My performance', icon: 'chart-bar', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer'] },
    ],
  },
  {
    title: 'Analytics',
    icon: 'chart-pie',
    items: [
      { href: '/reports', label: 'Reports & Power BI', icon: 'chart-column', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Viewer'] },
    ],
  },
  {
    title: 'Opportunities',
    icon: 'file-contract',
    items: [
      { href: '/tenders', label: 'Tenders', icon: 'briefcase', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/tenders/buyer-leads', label: 'Buyer Leads', icon: 'user-tie', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/tenders/rfqs', label: 'RFQs', icon: 'receipt', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/tenders/export', label: 'Export Opportunities', icon: 'ship', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/tenders/trade', label: 'Trade Intelligence', icon: 'earth', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/tenders/saved', label: 'Saved Opportunities', icon: 'bookmark', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/tenders/my-opportunities', label: 'My Opportunities', icon: 'star', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/tenders/assistant', label: 'AI Assistant', icon: 'wand-magic-sparkles', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst'] },
      { href: '/tenders/sources', label: 'Data sources', icon: 'satellite-dish', roles: ['Administrator', 'Marketing Manager'] },
      { href: '/tenders/interest-profiles', label: 'Interest profiles', icon: 'bullseye', roles: ['Administrator', 'Marketing Manager'] },
      { href: '/tenders/import', label: 'Import data', icon: 'file-import', roles: ['Administrator', 'Marketing Manager'] },
    ],
  },
  {
    title: 'Administration',
    icon: 'shield-halved',
    items: [
      { href: '/admin', label: 'Admin centre', icon: 'gears', roles: ['Administrator'] },
      { href: '/admin/kpi', label: 'Planning & performance', icon: 'chart-bar', roles: ['Administrator'] },
      { href: '/admin/corporate-marketing', label: 'Corporate marketing plan', icon: 'bullhorn', roles: ['Administrator'] },
      { href: '/admin/business-groups', label: 'Business groups', icon: 'building', roles: ['Administrator'] },
      { href: '/admin/customers', label: 'Customers', icon: 'users', roles: ['Administrator'] },
      { href: '/admin/products', label: 'Products', icon: 'box', roles: ['Administrator'] },
      { href: '/admin/competitors', label: 'Competitors', icon: 'chess-knight', roles: ['Administrator', 'Marketing Manager'] },
      { href: '/admin/product-catalogue', label: 'Product catalogue', icon: 'images', roles: ['Administrator'] },
      { href: '/admin/regions', label: 'Regions & outlets', icon: 'map-location-dot', roles: ['Administrator'] },
    ],
  },
  {
    title: 'Support',
    icon: 'circle-question',
    items: [
      { href: '/help', label: 'Help Center', icon: 'book-open', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
      { href: '/tours', label: 'Take a Tour', icon: 'person-chalkboard', roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'] },
    ],
  },
];

export function filteredNav(role: string | null): Array<{ title: string; icon: string; items: NavItem[] }> {
  if (!role) return [];
  return NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) })).filter((s) => s.items.length > 0);
}

export function Sidebar({ collapsed, mobileOpen, onNavigate }: {
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const sections = filteredNav(user?.role ?? null);

  const activeSection = NAV_SECTIONS.find((s) =>
    s.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
  );
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const s of NAV_SECTIONS) map[s.title] = activeSection ? s.title === activeSection.title : true;
    return map;
  });
  const [hydrated, setHydrated] = useState(false);
  const storageKey = user ? `kgmis_sidebar_open_${user.userId}` : null;

  // Restore saved open/closed sections (per user) once on mount.
  useEffect(() => {
    if (!storageKey) { setHydrated(true); return; }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const arr: unknown = JSON.parse(raw);
        if (Array.isArray(arr)) {
          // Match case-insensitively so earlier saved labels keep working.
          const byLower = new Map(NAV_SECTIONS.map((s) => [s.title.toLowerCase(), s.title]));
          const map: Record<string, boolean> = {};
          for (const s of NAV_SECTIONS) map[s.title] = false;
          for (const t of arr) {
            if (typeof t !== 'string') continue;
            const canonical = byLower.get(t.toLowerCase());
            if (canonical) map[canonical] = true;
          }
          setOpenMap(map);
        }
      }
    } catch { /* noop */ }
    setHydrated(true);
  }, [storageKey]);

  // Always keep the section of the current page open (on load and on navigation),
  // and persist that choice.
  useEffect(() => {
    const active = NAV_SECTIONS.find((s) =>
      s.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    );
    if (!active) return;
    setOpenMap((m) => ((m[active.title] ?? true) ? m : { ...m, [active.title]: true }));
  }, [pathname]);

  // Persist open sections once the restored state has been applied.
  useEffect(() => {
    if (!storageKey || !hydrated) return;
    try {
      const open = NAV_SECTIONS.filter((s) => openMap[s.title] ?? true).map((s) => s.title);
      localStorage.setItem(storageKey, JSON.stringify(open));
    } catch { /* noop */ }
  }, [openMap, hydrated, storageKey]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:4000'}${user.profilePhoto}`)
    : null;

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo logo-img" src="/logo.png" alt="KG-MIS logo" />
        <span className="sidebar-brand-text">Marketing Intelligence System</span>
      </div>
      <nav className="sidebar-nav">
        {sections.map((s) => {
          const open = openMap[s.title] ?? true;
          return (
            <div key={s.title}>
              <button
                type="button"
                className="sidebar-section"
                aria-expanded={open}
                title={collapsed ? s.title : undefined}
                onClick={() => setOpenMap((m) => ({ ...m, [s.title]: !(m[s.title] ?? true) }))}
              >
                <span className="sidebar-section-label">
                  <Icon name={s.icon} />
                  <span className="sidebar-section-text">{s.title}</span>
                </span>
                <Icon name={open ? 'chevron-down' : 'chevron-right'} />
              </button>
              {open && s.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive(item.href) ? 'active' : ''}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="icon"><Icon name={item.icon} /></span>
                  <span className="sidebar-nav-text">{item.label}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      {user ? (
        <div
          className="sidebar-user"
          role="button"
          tabIndex={0}
          title={collapsed ? 'Profile' : undefined}
          onClick={() => { router.push('/profile'); onNavigate(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { router.push('/profile'); onNavigate(); } }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt={user.name} />
          ) : (
            <div className="avatar">{user.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
          )}
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-role">{user.role}</div>
          </div>
        </div>
      ) : null}
      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-signout"
          title={collapsed ? 'Sign out' : undefined}
          onClick={() => { logout(); window.location.href = '/login'; }}
        >
          <span className="icon"><Icon name="right-from-bracket" /></span>
          <span className="sidebar-nav-text">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
