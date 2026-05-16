'use client';

/**
 * EmbedSnippet — collapsible "Embed this on your site" UI.
 * Shows an iframe HTML snippet with copy-to-clipboard, suitable for
 * blog posts, group sites, or any HTML surface.
 *
 * The snippet URL is built from `embedPath` against the canonical
 * host. Generic across embed types — calendar event, profile, or
 * single event-type booking page.
 */

import { useState } from 'react';
import { Code, Copy, Check } from 'lucide-react';

const HOST = 'liminalcalendar.com';

interface EmbedSnippetProps {
  /** Path under the host, e.g. `/embed/events/123` */
  embedPath: string;
  /** Iframe height in pixels — caller picks based on content. */
  height?: number;
  /** Optional small label override. */
  label?: string;
}

export function EmbedSnippet({ embedPath, height = 320, label = 'Embed on your site' }: EmbedSnippetProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = `https://${HOST}${embedPath}`;
  const snippet = `<iframe src="${url}" width="100%" height="${height}" frameborder="0" style="border:1px solid #ddd;border-radius:6px;max-width:560px"></iframe>`;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-2.5 px-4 border border-grove-border text-grove-text text-sm font-medium rounded-lg hover:bg-grove-border/20 transition-colors inline-flex items-center justify-center gap-1.5"
      >
        <Code size={14} aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-grove-border bg-grove-bg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-grove-text">Embed code</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-grove-text-muted hover:text-grove-text"
        >
          Close
        </button>
      </div>
      <textarea
        readOnly
        aria-label="Embed iframe HTML"
        value={snippet}
        rows={3}
        className="w-full px-2 py-1.5 rounded border border-grove-border bg-grove-surface text-grove-text text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-grove-accent"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void onCopy()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-grove-accent text-white text-xs font-medium"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy embed code'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-grove-text-muted underline"
        >
          Preview
        </a>
      </div>
    </div>
  );
}
