'use client';

import React, { useEffect, useState } from 'react';
import type { DisplayEvent } from '@/lib/display-event';
import { toDateKey } from '@/lib/calendar-utils';
import { HourCell } from './HourCell';
import { EventBlock } from './EventBlock';
import { computeOverlapLayout } from './overlap';
import { SLOTS_PER_DAY } from '@/lib/golden-hours';
import { eventToMinutes } from '@/lib/event-time-display';

const SLOTS = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i);

interface DayColumnProps {
  day: Date;
  events: DisplayEvent[];
  isToday: boolean;
  currentHour?: number;
  hourHeights: number[];
  hourOffsets: number[];
  dissolvingIds: Set<string>;
  spawningIds: Set<string>;
  onCellClick?: (day: Date, hour: number, rect: DOMRect) => void;
  onEventClick: (event: DisplayEvent, rect: DOMRect) => void;
  /** Hylo ID (or `null` if unauthenticated) of the viewing user. Threads
   *  through to EventBlock as `isOwner = String(creator_id) === String(currentUserId)`.
   *  WeeklyGrid is the source of truth — it pulls from the session. */
  currentUserId?: string | null;
  /** Forwarded to EventBlock.onDragStart. WeeklyGrid owns the drag lifecycle. */
  onEventDragStart?: (event: DisplayEvent, e: React.PointerEvent<HTMLDivElement>) => void;
}

const DayColumn = React.memo(function DayColumn({
  day,
  events,
  isToday,
  currentHour,
  hourHeights,
  hourOffsets,
  dissolvingIds,
  spawningIds,
  onCellClick,
  onEventClick,
  currentUserId,
  onEventDragStart,
}: DayColumnProps) {
  // Mount gate — events position using browser-local TZ via getHours(), which
  // returns UTC during SSR (Vercel's Node runs UTC). Without this gate the
  // event blocks render at SSR-UTC rows then snap to local-TZ rows on
  // hydration, producing a visible flash and (near midnight UTC) wrong-day
  // placement. We suppress event rendering entirely until after mount so the
  // first paint is correct. HourCells render unconditionally — they're
  // TZ-independent.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const dateKey = toDateKey(day);
  const dayEvents = events.filter(e => toDateKey(new Date(e.starts_at)) === dateKey);

  const overlapInput = dayEvents.map(e => ({
    id: e.id,
    ...eventToMinutes(e),
  }));

  const overlapMap = computeOverlapLayout(overlapInput);

  return (
    <div className="relative flex-1 min-w-0 border-l border-grove-border">
      {/* 30-min slot cells */}
      {SLOTS.map(slot => (
        <HourCell
          key={slot}
          day={day}
          hour={slot}
          isToday={isToday}
          currentHour={currentHour}
          hourHeight={hourHeights[slot]}
          onCellClick={onCellClick}
        />
      ))}

      {/* Event overlays — positioned using golden hour offsets. Gated on
          `mounted` so SSR (UTC) doesn't paint at the wrong rows. */}
      {mounted && dayEvents.map(event => {
        const overlap = overlapMap.get(event.id) ?? { colIndex: 0, colTotal: 1 };
        const isOwner = currentUserId != null
          && String(event.creator_id) === String(currentUserId);
        return (
          <EventBlock
            key={event.id}
            event={event}
            colIndex={overlap.colIndex}
            colTotal={overlap.colTotal}
            hourHeights={hourHeights}
            hourOffsets={hourOffsets}
            isDissolving={dissolvingIds.has(event.id)}
            isSpawning={spawningIds.has(event.id)}
            onEventClick={onEventClick}
            isOwner={isOwner}
            onDragStart={onEventDragStart}
          />
        );
      })}
    </div>
  );
});

export { DayColumn };
