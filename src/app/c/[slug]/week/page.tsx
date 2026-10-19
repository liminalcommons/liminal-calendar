'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { WeeklyGrid } from '@/components/calendar/WeeklyGrid';
import { CategoryLegend } from '@/components/calendar/CategoryLegend';
import { expandRecurringEvents } from '@/lib/recurrence-expander';
import type { DisplayEvent } from '@/lib/display-event';

/** Conference week tab: same grid, conference-scoped pool, category key. */
export default function ConferenceWeekPage() {
  const { slug } = useParams<{ slug: string }>();
  const [events, setEvents] = useState<DisplayEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      limit: '200',
      conference: slug,
    });
    fetch(`/api/events?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setEvents(expandRecurringEvents(data, from, to));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="h-[calc(100vh-230px)] min-h-[480px] flex flex-col">
      <CategoryLegend />
      <div className="flex-1 min-h-0">
        <WeeklyGrid events={events} />
      </div>
    </div>
  );
}
