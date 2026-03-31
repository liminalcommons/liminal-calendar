'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, isToday, addWeeks, subWeeks, addDays, isBefore, parseISO } from 'date-fns';
import type { DisplayEvent } from '@/lib/display-event';
import { getWeekStart, getWeekDays, DAY_NAMES } from '@/lib/calendar-utils';
import { calendarSFX } from '@/lib/sound-manager';
import { useEvents } from '@/lib/use-events';
import { computeHourHeights, computeHourOffsets } from '@/lib/golden-hours';
import { MoonPhase } from '@/components/MoonPhase';
import { TimeGutter } from './TimeGutter';
import { DayColumn } from './DayColumn';
import { NowIndicator } from './NowIndicator';
import { EventExpansion } from './EventExpansion';
import { QuickCreatePopover } from './QuickCreatePopover';

interface WeeklyGridProps {
  events: DisplayEvent[];
}

export function WeeklyGrid({ events: serverEvents }: WeeklyGridProps) {
  const { events, addEvent, removeEvent, updateEvent } = useEvents(serverEvents);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getWeekStart(new Date())
  );
  const [currentHour, setCurrentHour] = useState<number>(() => new Date().getHours());
  const [expansion, setExpansion] = useState<{ event: DisplayEvent; rect: DOMRect } | null>(null);
  const [quickCreate, setQuickCreate] = useState<{ day: Date; hour: number; rect: DOMRect } | null>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const gridRef = useRef<HTMLDivElement>(null);

  const weekDays = getWeekDays(currentWeekStart);

  // Golden hour heights — recompute when container resizes
  const hourHeights = useMemo(() => computeHourHeights(containerHeight), [containerHeight]);
  const hourOffsets = useMemo(() => computeHourOffsets(hourHeights), [hourHeights]);
  const totalGridHeight = hourHeights.reduce((s, h) => s + h, 0);

  // Update current hour every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Measure container for golden hour sizing
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(Math.floor(entry.contentRect.height));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function isCurrentWeek(weekStart: Date): boolean {
    const todayWeek = getWeekStart(new Date());
    return weekStart.getTime() === todayWeek.getTime();
  }

  const goToPrevWeek = useCallback(() => {
    setCurrentWeekStart(prev => subWeeks(prev, 1));
    calendarSFX.play('navigate');
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentWeekStart(prev => addWeeks(prev, 1));
    calendarSFX.play('navigate');
  }, []);

  const goToToday = useCallback(() => {
    setCurrentWeekStart(getWeekStart(new Date()));
    calendarSFX.play('navigate');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        goToPrevWeek();
        break;
      case 'ArrowRight':
        e.preventDefault();
        goToNextWeek();
        break;
      case 'Escape':
        e.preventDefault();
        goToToday();
        break;
    }
  }, [goToToday, goToPrevWeek, goToNextWeek]);

  const handleCellClick = useCallback((day: Date, hour: number, rect: DOMRect) => {
    setExpansion(null);
    setQuickCreate({ day, hour, rect });
  }, []);

  const handleEventClick = useCallback((event: DisplayEvent, rect: DOMRect) => {
    setQuickCreate(null);
    setExpansion({ event, rect });
  }, []);

  const handleEventCreated = useCallback((event: DisplayEvent) => {
    addEvent(event);
  }, [addEvent]);

  const handleEventDeleted = useCallback((id: string) => {
    removeEvent(id);
    setExpansion(null);
  }, [removeEvent]);

  const handleEventUpdated = useCallback((id: string, patch: Partial<DisplayEvent>) => {
    updateEvent(id, patch);
  }, [updateEvent]);

  // Week header label
  const weekLabel = (() => {
    const start = weekDays[0];
    const end = weekDays[6];
    if (start.getMonth() === end.getMonth()) {
      return format(start, 'MMMM yyyy');
    }
    if (start.getFullYear() !== end.getFullYear()) {
      return `${format(start, 'MMM yyyy')} – ${format(end, 'MMM yyyy')}`;
    }
    return `${format(start, 'MMM')} – ${format(end, 'MMM yyyy')}`;
  })();

  return (
    <div
      className="flex flex-col h-full bg-grove-bg focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label="Weekly calendar grid"
    >
      {/* ── Header bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-grove-surface border-b border-grove-border">
        <div className="flex items-center gap-3">
          <MoonPhase />
          <span className="text-sm font-semibold text-grove-text">{weekLabel}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevWeek}
            className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={goToToday}
            className="px-3 py-1 rounded-md text-xs font-medium text-grove-accent-deep
                       hover:bg-grove-border/30 border border-grove-border/60 transition-colors"
            aria-label="Go to today"
          >
            Today
          </button>

          <button
            onClick={goToNextWeek}
            className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Day headers row ── */}
      <div className="flex-shrink-0 flex bg-grove-surface border-b border-grove-border">
        <div className="w-14 flex-shrink-0" />

        {weekDays.map((day, i) => {
          const today = isToday(day);
          const dayNum = format(day, 'd');
          const dayName = DAY_NAMES[i];

          return (
            <div
              key={i}
              className="flex-1 min-w-0 flex flex-col items-center justify-center py-1 border-l border-grove-border/40"
            >
              <span className={`text-[10px] font-medium uppercase tracking-wider ${
                today ? 'text-grove-accent' : 'text-grove-text-muted'
              }`}>
                {dayName}
              </span>
              <span className={`text-xs font-semibold rounded-full w-6 h-6 flex items-center justify-center mt-0.5 ${
                today
                  ? 'bg-grove-accent text-grove-surface'
                  : 'text-grove-text'
              }`}>
                {dayNum}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Popovers ── */}
      {expansion && (
        <EventExpansion
          event={expansion.event}
          anchorRect={expansion.rect}
          onClose={() => setExpansion(null)}
          onDelete={handleEventDeleted}
          onUpdate={handleEventUpdated}
        />
      )}
      {quickCreate && (
        <QuickCreatePopover
          day={quickCreate.day}
          hour={quickCreate.hour}
          anchorRect={quickCreate.rect}
          onClose={() => setQuickCreate(null)}
          onCreated={handleEventCreated}
        />
      )}

      {/* ── Grid body — fills remaining space, no scroll ── */}
      <div
        ref={gridRef}
        className="flex-1 overflow-hidden"
        style={{ minHeight: 0 }}
      >
        <div className="flex" style={{ height: totalGridHeight }}>
          {/* Time gutter */}
          <TimeGutter hourHeights={hourHeights} />

          {/* Day columns + NowIndicator */}
          <div className="relative flex flex-1 min-w-0">
            {isCurrentWeek(currentWeekStart) && (
              <NowIndicator hourHeights={hourHeights} hourOffsets={hourOffsets} />
            )}

            {/* Empty week hint */}
            {(() => {
              const weekEnd = addDays(currentWeekStart, 7);
              return !events.some(e => {
                const start = parseISO(e.starts_at);
                return !isBefore(start, currentWeekStart) && isBefore(start, weekEnd);
              });
            })() && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="text-center text-grove-text-muted/50 select-none">
                  <p className="text-sm">No events this week</p>
                  <p className="text-xs mt-1">Click any time slot to create one</p>
                </div>
              </div>
            )}

            {weekDays.map((day, i) => (
              <DayColumn
                key={i}
                day={day}
                events={events}
                isToday={isToday(day)}
                currentHour={currentHour}
                hourHeights={hourHeights}
                hourOffsets={hourOffsets}
                onCellClick={handleCellClick}
                onEventClick={handleEventClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
