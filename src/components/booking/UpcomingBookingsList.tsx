'use client';

/**
 * UpcomingBookingsList — client renderer for /book's "Your upcoming 1:1s"
 * section. Server passes in the list; this component owns local-time
 * formatting + the cancel affordance (CancelBookingButton inline per row).
 *
 * On cancel we splice the row out of state locally for a snappy UX —
 * the next /book load (or any navigation) will re-fetch from server.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import type { UpcomingBooking } from '@/lib/booking/upcoming-bookings';
import { CancelBookingButton } from './CancelBookingButton';

const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

export function UpcomingBookingsList({ initial }: { initial: UpcomingBooking[] }) {
  const [items, setItems] = useState(initial);

  if (items.length === 0) {
    return (
      <p className="text-sm text-grove-text-muted">
        No upcoming 1:1s. When someone books time with you (or you book time
        with someone), it'll show up here.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((b) => {
        const start = new Date(b.startsAt);
        const end = b.endsAt ? new Date(b.endsAt) : null;
        const dayLabel = dayFmt.format(start);
        const timeLabel = end
          ? `${timeFmt.format(start)} – ${timeFmt.format(end)}`
          : timeFmt.format(start);
        const roleBadge = b.viewerIsHost ? 'Hosting' : 'Attending';
        return (
          <li
            key={b.id}
            className="rounded border border-grove-border bg-grove-bg p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-grove-text-muted">
                  <Calendar size={12} aria-hidden="true" />
                  <span>{dayLabel}</span>
                  <span>·</span>
                  <span>{timeLabel}</span>
                  <span>·</span>
                  <span className="px-1.5 py-0.5 rounded bg-grove-surface border border-grove-border text-[10px] uppercase tracking-wide">
                    {roleBadge}
                  </span>
                </div>
                <Link
                  href={`/events/${b.id}`}
                  className="block text-sm font-medium text-grove-text hover:text-grove-accent truncate mt-1"
                >
                  {b.title}
                </Link>
                <p className="text-xs text-grove-text-muted">
                  {b.viewerIsHost ? 'with ' : 'with '}
                  {b.otherPartyName}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <CancelBookingButton
                eventId={b.id}
                size="compact"
                triggerLabel="Cancel"
                onCancelled={() => setItems((cur) => cur.filter((x) => x.id !== b.id))}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
