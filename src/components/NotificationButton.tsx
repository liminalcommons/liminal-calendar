'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';

interface NotificationRow {
  id: number;
  type: string;
  eventId: number | null;
  actorName: string | null;
  title: string;
  body: string | null;
  url: string;
  createdAt: string;
  seenAt: string | null;
}

interface ListResponse {
  notifications: NotificationRow[];
  unseenCount: number;
}

const POLL_INTERVAL_MS = 60_000;

function relativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(isoString).toLocaleDateString();
}

export function NotificationButton() {
  const { status } = useSession();
  const isAuthed = status === 'authenticated';
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchList = useCallback(async () => {
    if (!isAuthed) return;
    try {
      const res = await apiFetch('/api/notifications?limit=20');
      if (!res.ok) return;
      const data = (await res.json()) as ListResponse;
      setItems(data.notifications);
      setUnseen(data.unseenCount);
    } catch {
      // network blip — keep current state
    }
  }, [isAuthed]);

  // Initial load + interval polling.
  useEffect(() => {
    if (!isAuthed) return;
    fetchList();
    const id = window.setInterval(fetchList, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isAuthed, fetchList]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Open the dropdown → mark all unseen as seen, optimistically clear badge.
  const handleOpen = useCallback(async () => {
    setOpen(true);
    if (unseen === 0) return;
    setUnseen(0);
    setLoading(true);
    try {
      await apiFetch('/api/notifications/seen', { method: 'POST' });
    } catch {
      // best effort — bell will refresh on next poll
    } finally {
      setLoading(false);
    }
  }, [unseen]);

  if (!isAuthed) return null;

  const badgeText = unseen > 9 ? '9+' : String(unseen);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="relative flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
        aria-label={`Notifications${unseen > 0 ? ` (${unseen} unread)` : ''}`}
      >
        <Bell size={14} />
        <span className="text-[8px] leading-none">Inbox</span>
        {unseen > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-grove-accent text-grove-surface text-[9px] font-semibold flex items-center justify-center leading-none"
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-grove-surface border border-grove-border rounded-lg shadow-lg w-80 max-h-[420px] overflow-y-auto z-50">
          <div className="px-3 py-2 border-b border-grove-border sticky top-0 bg-grove-surface flex items-center justify-between">
            <span className="text-xs font-semibold text-grove-text">Notifications</span>
            {loading && <span className="text-[10px] text-grove-text-muted italic">syncing…</span>}
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-xs text-grove-text-muted text-center">
              No notifications yet. We&apos;ll let you know when something happens.
            </p>
          ) : (
            <ul className="divide-y divide-grove-border">
              {items.map((n) => {
                const isInternal = n.url.startsWith('/');
                const content = (
                  <>
                    <p className="text-xs font-medium text-grove-text leading-snug">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-[11px] text-grove-text-muted mt-0.5 leading-snug">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[10px] text-grove-text-muted mt-1">
                      {relativeTime(n.createdAt)}
                    </p>
                  </>
                );
                const className = `block px-3 py-2 hover:bg-grove-border/30 transition-colors ${
                  n.seenAt ? 'opacity-70' : ''
                }`;
                return (
                  <li key={n.id}>
                    {isInternal ? (
                      <Link href={n.url} onClick={() => setOpen(false)} className={className}>
                        {content}
                      </Link>
                    ) : (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className={className}
                      >
                        {content}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
