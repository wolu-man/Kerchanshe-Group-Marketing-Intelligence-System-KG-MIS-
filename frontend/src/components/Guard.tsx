'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';

/**
 * Wraps protected pages: shows a spinner while the session is validated and
 * redirects to /login when unauthenticated (Security Matrix Section 5).
 */
export function Guard({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="spinner-center">
        <div className="spinner" />
      </div>
    );
  }
  if (!user) {
    // During SSR, return a loading state instead of null to avoid 404
    return (
      <div className="spinner-center">
        <div className="spinner" />
      </div>
    );
  }
  return <Shell>{children}</Shell>;
}

/**
 * Role gate for specific screens. Renders a 403 message when the current
 * role is not allowed (mirrors the backend permission matrix).
 */
export function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    return (
      <div className="empty">
        <div className="icon"><Icon name="lock" /></div>
        <div>You do not have permission to view this screen.</div>
        <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>Contact an administrator if you believe this is a mistake.</div>
      </div>
    );
  }
  return <>{children}</>;
}
