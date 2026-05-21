'use client';

import { useEffect } from 'react';

// Last-line-of-defence boundary for errors thrown above the root layout
// (e.g. ClerkProvider crash). Can't import client-logger via the `@/`
// alias safely here because if `Providers` is broken we may not have a
// React tree at all — push directly to localStorage so the next session's
// FAB picks it up.
//
// global-error.tsx MUST render its own <html>/<body>.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'error' as const,
        message: `[GlobalError] ${error.name}: ${error.message}\n${error.stack ?? '(no stack)'}${error.digest ? ` (digest=${error.digest})` : ''}`,
      };
      const prev = JSON.parse(localStorage.getItem('bug-report-pending') ?? '[]');
      prev.push(entry);
      // Cap at 20 stashed entries — the next session merges these on mount.
      localStorage.setItem('bug-report-pending', JSON.stringify(prev.slice(-20)));
    } catch { /* best effort */ }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: '#0f0e0c', color: '#e8dccc', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ maxWidth: 480, padding: '1.5rem', borderRadius: 8, background: '#1a1815', border: '1px solid #3a342c' }}>
          <h1 style={{ marginTop: 0, fontSize: '1.125rem' }}>Liminal Calendar — fatal error</h1>
          <p style={{ fontSize: '0.875rem', color: '#a89880' }}>
            The page failed to load. Refresh to try again. If it keeps happening, please reach out — the error has been logged locally and will attach to your next bug report.
          </p>
        </div>
      </body>
    </html>
  );
}
