'use client';

import { useEffect } from 'react';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[AdminError]', error);
  }, [error]);

  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h1 style={{ color: 'var(--danger)', marginBottom: 8 }}>Admin Section Error</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        {error.message || 'Something went wrong in the admin panel.'}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '10px 24px',
          background: 'var(--primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Reload page
      </button>
    </div>
  );
}
