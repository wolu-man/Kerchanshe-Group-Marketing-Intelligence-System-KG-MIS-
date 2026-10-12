'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { toast } from '@/components/Toast';
import { Button, Field } from '@/components/ui';
import { TourTriggerLink } from '@/components/tour/TourTrigger';

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Already authenticated -> dashboard.
  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(username.trim(), password);
      toast.success(`Welcome, ${u.name}`);
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Login failed');
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/logo.png" alt="KG-MIS logo" />
        </div>
        <div className="tagline">Kerchanshe Group Marketing Intelligence System</div>
        <form onSubmit={onSubmit}>
          <Field label="Username" required>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              placeholder="e.g. field1"
            />
          </Field>
          <Field label="Password" required>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" busy={busy} size="lg" className="login-btn">
            Sign in
          </Button>
        </form>
        <p className="dev-note" style={{ marginTop: 16, fontSize: 12, color: 'var(--text-faint)' }}>
          Development build — CUAS SSO is wired in production.
        </p>
        <div style={{ marginTop: 4, textAlign: 'center' }}>
          <TourTriggerLink tourId="signin" label="Take a tour before signing in" />
        </div>
      </div>
    </div>
  );
}
