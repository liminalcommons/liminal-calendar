'use client';

import React from 'react';
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
}: DayColumnProps) {
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

      {/* Event overlays — positioned using golden hour offsets */}
      {dayEvents.map(event => {
        const overlap = overlapMap.get(event.id) ?? { colIndex: 0, colTotal: 1 };
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
          />
        );
      })}
    </div>
  );
});

export { DayColumn };
