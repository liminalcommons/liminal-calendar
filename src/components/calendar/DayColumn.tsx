'use client';

import React from 'react';
import type { DisplayEvent } from '@/lib/display-event';
import { toDateKey } from '@/lib/calendar-utils';
import { HourCell } from './HourCell';
import { EventBlock } from './EventBlock';
import { computeOverlapLayout } from './overlap';
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface DayColumnProps {
  day: Date;
  events: DisplayEvent[];
  isToday: boolean;
  currentHour?: number;
  hourHeight: number;
  onCellClick?: (day: Date, hour: number, rect: DOMRect) => void;
  onEventClick: (event: DisplayEvent, rect: DOMRect) => void;
}

function eventToMinutes(event: DisplayEvent): { startMinutes: number; endMinutes: number } {
  const start = new Date(event.starts_at);
  const startMinutes = start.getHours() * 60 + start.getMinutes();

  let endMinutes: number;
  if (event.ends_at) {
    const end = new Date(event.ends_at);
    endMinutes = end.getHours() * 60 + end.getMinutes();
    // Handle events spanning midnight: clamp to 24*60
    if (endMinutes <= startMinutes) endMinutes = 24 * 60;
  } else {
    endMinutes = startMinutes + 60; // Default 1 hour
  }
  return { startMinutes, endMinutes };
}

const DayColumn = React.memo(function DayColumn({
  day,
  events,
  isToday,
  currentHour,
  hourHeight,
  onCellClick,
  onEventClick,
}: DayColumnProps) {
  const dateKey = toDateKey(day);

  // Filter events to this day only
  const dayEvents = events.filter(e => toDateKey(new Date(e.starts_at)) === dateKey);

  // Build overlap input
  const overlapInput = dayEvents.map(e => ({
    id: e.id,
    ...eventToMinutes(e),
  }));

  const overlapMap = computeOverlapLayout(overlapInput);

  return (
    <div className="relative flex-1 min-w-0 border-l border-grove-border/40">
      {/* Hour cells */}
      {HOURS.map(hour => (
        <HourCell
          key={hour}
          day={day}
          hour={hour}
          isToday={isToday}
          currentHour={currentHour}
          hourHeight={hourHeight}
          onCellClick={onCellClick}
        />
      ))}

      {/* Event overlays */}
      {dayEvents.map(event => {
        const overlap = overlapMap.get(event.id) ?? { colIndex: 0, colTotal: 1 };
        return (
          <EventBlock
            key={event.id}
            event={event}
            colIndex={overlap.colIndex}
            colTotal={overlap.colTotal}
            hourHeight={hourHeight}
            onEventClick={onEventClick}
          />
        );
      })}
    </div>
  );
});

export { DayColumn };
