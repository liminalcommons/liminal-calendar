'use client';

import { useEffect, useState } from 'react';
import { NavBar } from '@/components/NavBar';
import { MonthlyGrid } from '@/components/calendar/MonthlyGrid';
import type { DisplayEvent } from '@/lib/display-event';
import { expandRecurringEvents } from '@/lib/recurrence-expander';
import { addMonths } from 'date-fns';

export default function MonthPage() {
  const [events, setEvents] = useState<DisplayEvent[]>([]);

  useEffect(() => {
    fetch('/api/events')
      .then(r => {
        if (r.status === 401) {
          const gateway = 'https://auth.castalia.one';
          window.location.href = `${gateway}/signin?callbackUrl=${encodeURIComponent(window.location.href)}`;
          return [];
        }
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          const now = new Date();
          const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const rangeEnd = addMonths(now, 6);
          setEvents(expandRecurringEvents(data, rangeStart, rangeEnd));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="h-screen bg-grove-bg flex flex-col overflow-hidden p-2 pt-0">
      <NavBar />
      <main className="flex-1 min-h-0 border border-grove-border rounded-lg overflow-hidden">
        <MonthlyGrid events={events} />
      </main>
    </div>
  );
}
