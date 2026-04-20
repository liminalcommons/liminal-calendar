'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { LogIn, X } from 'lucide-react';
import { SESSION_EXPIRED_EVENT } from '@/lib/api-fetch';

/**
 * Shown when an authenticated API call returns 401. Auth gateway is supposed
 * to refresh transparently but mobile Universal Link hijacks break that —
 * instead of silently breaking the app, we tell the user and give them a
 * one-click path to re-auth.
 */
export function SessionExpiredBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onExpired = () => setVisible(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-grove-surface border border-grove-accent/50 shadow-lg max-w-md w-[calc(100%-2rem)]"
    >
      <div className="flex-1 text-sm text-grove-text">
        Your session expired. Sign in again to keep editing.
      </div>
      <button
        onClick={() => signIn('hylo')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-grove-accent-deep text-grove-surface text-xs font-medium hover:opacity-90 transition-opacity"
      >
        <LogIn size={12} />
        Sign in
      </button>
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="p-1 text-grove-text-muted hover:text-grove-text transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
