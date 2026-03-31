'use client';

import React, { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isToday,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import Link from 'next/link';
import type { DisplayEvent } from '@/lib/display-event';
import { toDateKey } from '@/lib/calendar-utils';
import { calendarSFX } from '@/lib/sound-manager';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface MonthlyGridProps {
  events: DisplayEvent[];
}

export function MonthlyGrid({ events }: MonthlyGridProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group events by date key
  const eventsByDate = new Map<string, DisplayEvent[]>();
  for (const event of events) {
    const key = toDateKey(new Date(event.starts_at));
    const list = eventsByDate.get(key) ?? [];
    list.push(event);
    eventsByDate.set(key, list);
  }

  const goToPrevMonth = useCallback(() => {
    setCurrentMonth(prev => subMonths(prev, 1));
    calendarSFX.play('navigate');
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth(prev => addMonths(prev, 1));
    calendarSFX.play('navigate');
  }, []);

  const goToThisMonth = useCallback(() => {
    setCurrentMonth(new Date());
    calendarSFX.play('navigate');
  }, []);

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  return (
    <div className="flex flex-col h-full bg-grove-bg">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-grove-surface border-b border-grove-border">
        <span className="text-sm font-semibold text-grove-text">
          {format(currentMonth, 'MMMM yyyy')}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevMonth}
            className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goToThisMonth}
            className="px-3 py-1 rounded-md text-xs font-medium text-grove-accent-deep
                       hover:bg-grove-border/30 border border-grove-border/60 transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Day-of-week labels */}
      <div className="flex-shrink-0 grid grid-cols-7 bg-grove-surface border-b border-grove-border">
        {DAY_LABELS.map(label => (
          <div key={label} className="text-center py-1 text-[10px] font-medium uppercase tracking-wider text-grove-text-muted">
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-rows-[repeat(auto-fill,1fr)]">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-grove-border min-h-0">
            {week.map((day, di) => {
              const key = toDateKey(day);
              const dayEvents = eventsByDate.get(key) ?? [];
              const inMonth = isSameMonth(day, currentMonth);
              const today = isToday(day);

              return (
                <div
                  key={di}
                  className={`border-r border-grove-border p-1 overflow-hidden flex flex-col
                    ${inMonth ? '' : 'opacity-40'}
                    ${today ? 'bg-grove-accent/10' : ''}
                  `}
                >
                  {/* Day number */}
                  <span className={`text-xs font-semibold mb-0.5 ${
                    today
                      ? 'text-grove-accent bg-grove-accent/20 rounded-full w-5 h-5 flex items-center justify-center'
                      : 'text-grove-text-muted'
                  }`}>
                    {format(day, 'd')}
                  </span>

                  {/* Events (max 3 shown) */}
                  {dayEvents.slice(0, 3).map(event => (
                    <Link
                      key={event.id}
                      href={`/events/${event.id}`}
                      className="text-[10px] leading-tight truncate rounded px-1 py-0.5 mb-0.5
                                 bg-grove-green/15 text-grove-green-deep hover:bg-grove-green/25 transition-colors"
                    >
                      {event.title}
                    </Link>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[9px] text-grove-text-muted">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
