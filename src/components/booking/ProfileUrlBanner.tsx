'use client';

/**
 * ProfileUrlBanner — top-of-settings banner showing the member's
 * shareable booking profile URL (`liminalcalendar.com/<handle>`).
 *
 * Rendered only when the member has set a handle. Provides:
 *   - copy-to-clipboard
 *   - open-in-new-tab "view public profile" link
 *
 * Pure presentational client component — no data fetch; takes
 * `handle` as a prop from the server page.
 */

import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

const HOST = 'liminalcalendar.com';

export function ProfileUrlBanner({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false);
  const url = `https://${HOST}/${handle}`;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write failed; fall back to nothing — user can copy manually
    }
  }

  return (
    <div className="rounded border border-grove-border bg-grove-bg p-3 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-grove-text-muted">Your booking profile</p>
        <p className="text-sm font-mono text-grove-text truncate">{HOST}/{handle}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy profile URL"
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-grove-border bg-grove-surface text-xs text-grove-text hover:bg-grove-accent hover:text-white transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a
          href={`/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View public profile in new tab"
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-grove-border bg-grove-surface text-xs text-grove-text hover:bg-grove-accent hover:text-white transition-colors"
        >
          <ExternalLink size={12} />
          View
        </a>
      </div>
    </div>
  );
}
