'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { MonthlyGrid } from '@/components/calendar/MonthlyGrid';
import { CategoryLegend } from '@/components/calendar/CategoryLegend';
import { expandRecurringEvents } from '@/lib/recurrence-expander';
import { addMonths } from 'date-fns';
import type { DisplayEvent } from '@/lib/display-event';

const MONTH_CACHE_PREFIX = 'cal:confmonth:v1:';

/** Conference month tab: category-coloured grid over the conference scope. */
export default function ConferenceMonthPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = addMonths(now, 6);
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      limit: '200',
      conference: slug,
    });
    fetch(`/api/events?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          loadedRef.current = true;
          try {
            localStorage.setItem(`${MONTH_CACHE_PREFIX}${slug}:${userId ?? 'anon'}`, JSON.stringify(data));
          } catch {
            /* non-fatal */
          }
          setEvents(expandRecurringEvents(data, from, to));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, userId]);

  useEffect(() => {
    if (!userId || loadedRef.current) return;
    try {
      const cached = localStorage.getItem(`${MONTH_CACHE_PREFIX}${slug}:${userId}`);
      if (!cached) return;
      const raw = JSON.parse(cached);
      if (!Array.isArray(raw)) return;
      const now = new Date();
      setEvents(
        expandRecurringEvents(raw, new Date(now.getFullYear(), now.getMonth() - 1, 1), addMonths(now, 6)),
      );
    } catch {
      /* network will fill in */
    }
  }, [slug, userId]);

  return (
    <div className="h-[calc(100vh-230px)] min-h-[480px] bg-grove-bg flex flex-col overflow-hidden">
      <CategoryLegend />
      <div className="flex-1 min-h-0 border-t border-grove-border">
        <MonthlyGrid events={events} />
      </div>
    </div>
  );
}
