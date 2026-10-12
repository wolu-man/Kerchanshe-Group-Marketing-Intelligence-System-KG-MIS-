'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h1 style={{ color: 'var(--danger)', marginBottom: 8 }}>Application Error</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        {error.message || 'An unexpected error occurred.'}
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
