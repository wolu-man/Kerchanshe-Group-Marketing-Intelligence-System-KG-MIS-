'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearToken, localLogin, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('field1');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      clearToken();
      const result = await localLogin(username, password);
      setToken(result.token);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1>KG Market Intelligence</h1>
        <div className="sub">Sign in with your company account</div>

        {error && <div className="alert-box alert-error">{error}</div>}

        <form onSubmit={onSubmit}>
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 18 }} className="alert-box alert-info">
          Development mode: dev accounts (password <code>Password123!</code>):
          <br />
          admin (Administrator) · tsegaye.n (Marketing Manager) · analyst1 (Analyst) · field1/field2 (Field Officer) · viewer1 (Viewer)
        </div>
      </div>
    </div>
  );
}
