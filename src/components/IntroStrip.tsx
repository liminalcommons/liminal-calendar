'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

const DISMISS_COOKIE = 'liminal_intro_dismissed';

/**
 * One-time introduction for non-members who reached a calendar view without
 * passing through the landing page (direct /week, /list, /month links, or
 * "Enter as Guest"). Points to /about; dismissal persists via cookie.
 * Rendered by NavBar so every calendar view gets it for free.
 */
export function IntroStrip({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(true); // assume dismissed until mount
  useEffect(() => {
    setDismissed(
      document.cookie.split(';').some((c) => c.trim().startsWith(`${DISMISS_COOKIE}=1`)),
    );
  }, []);

  if (!show || dismissed) return null;

  const dismiss = () => {
    document.cookie = `${DISMISS_COOKIE}=1; path=/; max-age=${365 * 24 * 60 * 60}`;
    setDismissed(true);
  };

  return (
    <div
      data-testid="intro-strip"
      className="flex items-center justify-center gap-2 px-4 py-1.5 bg-grove-accent/10 border-b border-grove-border/60 text-xs text-grove-text"
    >
      <span className="italic">
        New here? This is the Liminal Calendar &mdash; free, open events to
        connect more deeply.
      </span>
      <Link
        href="/about"
        className="font-semibold text-grove-accent-deep hover:text-grove-accent underline underline-offset-2 shrink-0"
      >
        Read more &rarr;
      </Link>
      <button
        onClick={dismiss}
        aria-label="Dismiss introduction"
        className="ml-1 rounded p-0.5 text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  );
}
