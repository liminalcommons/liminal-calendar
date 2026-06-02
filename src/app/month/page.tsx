'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { NavBar } from '@/components/NavBar';
import { MonthlyGrid } from '@/components/calendar/MonthlyGrid';
import type { DisplayEvent } from '@/lib/display-event';
import { expandRecurringEvents } from '@/lib/recurrence-expander';
import { addMonths } from 'date-fns';

// Per-user localStorage SWR key — same privacy guarantee as /list: a different
// account on this browser can never be shown another user's events.
const MONTH_CACHE_PREFIX = 'cal:month:v1:';

function expandWindow(raw: unknown[]): DisplayEvent[] {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeEnd = addMonths(now, 6);
  return expandRecurringEvents(raw as never[], rangeStart, rangeEnd);
}

export default function MonthPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const loadedRef = useRef(false);
  const rawRef = useRef<unknown[] | null>(null);

  // Network revalidate — cookie-authed, once on mount.
  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const to = addMonths(now, 6).toISOString();
    fetch(`/api/events?from=${from}&to=${to}&limit=200`)
      .then(r => {
        if (r.status === 401) {
          console.warn('[month] 401 — session expired. Sign out and back in to refresh.');
          return [];
        }
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          loadedRef.current = true;
          rawRef.current = data;
          setEvents(expandWindow(data));
        }
      })
      .catch(() => {});
  }, []);

  // Instant paint from cache while the network is still in flight, user-matched.
  useEffect(() => {
    if (!userId || loadedRef.current) return;
    try {
      const cached = localStorage.getItem(MONTH_CACHE_PREFIX + userId);
      if (!cached) return;
      const raw = JSON.parse(cached);
      if (Array.isArray(raw)) setEvents(expandWindow(raw));
    } catch { /* corrupt cache — network will fill in */ }
  }, [userId]);

  // Persist raw payload keyed by user id for next open.
  useEffect(() => {
    if (!userId || !rawRef.current) return;
    try { localStorage.setItem(MONTH_CACHE_PREFIX + userId, JSON.stringify(rawRef.current)); } catch { /* quota/disabled — non-fatal */ }
  }, [userId, events]);

  return (
    <div className="h-screen bg-grove-bg flex flex-col overflow-hidden p-2 pt-0">
      <NavBar />
      <main className="flex-1 min-h-0 border border-grove-border rounded-lg overflow-hidden">
        <MonthlyGrid events={events} />
      </main>
    </div>
  );
}
