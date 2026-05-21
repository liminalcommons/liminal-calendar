'use client';

import { useEffect } from 'react';
import { recordEvent } from '@/lib/client-logger';

// Next.js App Router error boundary. Catches render errors thrown by any
// segment below this file. We capture the error into the bug-report log
// buffer so a user who clicks the FAB after a crash sees the actual stack
// in their report instead of an empty buffer (the crash itself never
// surfaces to console).
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const digest = error.digest ? ` (digest=${error.digest})` : '';
    recordEvent('error', `[ErrorBoundary]${digest} ${error.name}: ${error.message}\n${error.stack ?? '(no stack)'}`);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-grove-bg p-4">
      <div className="max-w-md w-full rounded-lg border border-grove-border bg-grove-surface p-6 space-y-3">
        <h1 className="text-lg font-semibold text-grove-text">Something went wrong</h1>
        <p className="text-sm text-grove-text-muted">
          The page hit an error. You can try again, or report it from the bug button at the bottom-right.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-grove-accent-deep text-grove-surface px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
