'use client';

/**
 * YourBookingHomeBanner — thin home-page strip surfaced to authed members
 * who have claimed a handle. Gives one-click access to their public
 * booking page and the booking settings without leaving the calendar.
 *
 * Mirrors ProfileUrlBanner's copy-link affordance but compressed for
 * the home grid.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check, ExternalLink, Settings as SettingsIcon, Link2 } from 'lucide-react';

const HOST = 'liminalcalendar.com';

export function YourBookingHomeBanner({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false);
  const url = `https://${HOST}/${handle}`;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write failed; user can copy manually
    }
  }

  return (
    <div className="mx-2 mt-2 rounded border border-grove-border bg-grove-surface px-3 py-2 flex flex-wrap items-center gap-2">
      <Link2 size={14} className="text-grove-accent shrink-0" aria-hidden="true" />
      <span className="text-xs text-grove-text-muted shrink-0">Your booking page</span>
      <a
        href={`/${handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-mono text-grove-text hover:text-grove-accent truncate flex-1 min-w-0"
      >
        {HOST}/{handle}
      </a>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy profile URL"
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-grove-border text-xs text-grove-text hover:bg-grove-bg transition-colors"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a
          href={`/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-grove-border text-xs text-grove-text hover:bg-grove-bg transition-colors"
          aria-label="Open public profile"
        >
          <ExternalLink size={11} />
          View
        </a>
        <Link
          href="/settings/booking"
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-grove-border text-xs text-grove-text hover:bg-grove-bg transition-colors"
          aria-label="Open booking settings"
        >
          <SettingsIcon size={11} />
          Settings
        </Link>
      </div>
    </div>
  );
}
