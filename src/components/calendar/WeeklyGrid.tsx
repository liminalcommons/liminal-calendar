'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, isToday, addWeeks, subWeeks, addDays, isBefore, isAfter, parseISO } from 'date-fns';
import type { DisplayEvent } from '@/lib/display-event';
import { getWeekStart, getWeekDays, DAY_NAMES } from '@/lib/calendar-utils';
import { calendarSFX } from '@/lib/sound-manager';
import { MoonPhase } from '@/components/MoonPhase';
import { TimeGutter, HOUR_HEIGHT } from './TimeGutter';
import { DayColumn } from './DayColumn';
import { NowIndicator } from './NowIndicator';
import { EventExpansion } from './EventExpansion';
import { QuickCreatePopover } from './QuickCreatePopover';

interface WeeklyGridProps {
  events: DisplayEvent[];
}

const SCROLL_HOUR_AMOUNT = HOUR_HEIGHT; // 1 hour
const SCROLL_PAGE_AMOUNT = HOUR_HEIGHT * 6; // 6 hours

export function WeeklyGrid({ events }: WeeklyGridProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getWeekStart(new Date())
  );
  const [currentHour, setCurrentHour] = useState<number>(() => new Date().getHours());
  const [expansion, setExpansion] = useState<{ event: DisplayEvent; rect: DOMRect } | null>(null);
  const [quickCreate, setQuickCreate] = useState<{ day: Date; hour: number; rect: DOMRect } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasMounted = useRef(false);

  const weekDays = getWeekDays(currentWeekStart);

  // Update current hour every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll on mount to current time (or 9 AM)
  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;

    const el = scrollRef.current;
    if (!el) return;

    const now = new Date();
    const targetHour = isCurrentWeek(currentWeekStart)
      ? Math.max(now.getHours() - 1, 0)
      : 9;
    const targetScroll = targetHour * HOUR_HEIGHT;

    // Small delay to let layout settle
    setTimeout(() => {
      el.scrollTop = targetScroll;
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Scroll to current time
    const el = scrollRef.current;
    if (el) {
      const targetHour = Math.max(new Date().getHours() - 1, 0);
      el.scrollTop = targetHour * HOUR_HEIGHT;
    }
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        el.scrollTop -= SCROLL_HOUR_AMOUNT;
        break;
      case 'ArrowDown':
        e.preventDefault();
        el.scrollTop += SCROLL_HOUR_AMOUNT;
        break;
      case 'PageUp':
        e.preventDefault();
        el.scrollTop -= SCROLL_PAGE_AMOUNT;
        break;
      case 'PageDown':
        e.preventDefault();
        el.scrollTop += SCROLL_PAGE_AMOUNT;
        break;
      case 'Home':
        e.preventDefault();
        el.scrollTop = 0;
        break;
      case 'End':
        e.preventDefault();
        el.scrollTop = el.scrollHeight;
        break;
      case 'Escape':
        e.preventDefault();
        goToToday();
        break;
    }
  }, [goToToday]);

  const handleCellClick = useCallback((day: Date, hour: number, rect: DOMRect) => {
    setExpansion(null);
    setQuickCreate({ day, hour, rect });
  }, []);

  const handleEventClick = useCallback((event: DisplayEvent, rect: DOMRect) => {
    setQuickCreate(null);
    setExpansion({ event, rect });
  }, []);

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

  const totalGridHeight = 24 * HOUR_HEIGHT;

  return (
    <div
      className="flex flex-col h-full bg-grove-bg focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label="Weekly calendar grid"
    >
      {/* ── Header bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-grove-surface border-b border-grove-border">
        {/* Moon phase + week label */}
        <div className="flex items-center gap-3">
          <MoonPhase />
          <span className="text-sm font-semibold text-grove-text">{weekLabel}</span>
        </div>

        {/* Navigation */}
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
        {/* Spacer for time gutter */}
        <div className="w-16 flex-shrink-0" />

        {weekDays.map((day, i) => {
          const today = isToday(day);
          const dayNum = format(day, 'd');
          const dayName = DAY_NAMES[i];

          return (
            <div
              key={i}
              className="flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 border-l border-grove-border/40"
            >
              <span className={`text-[10px] font-medium uppercase tracking-wider ${
                today ? 'text-grove-accent' : 'text-grove-text-muted'
              }`}>
                {dayName}
              </span>
              <span className={`text-sm font-semibold rounded-full w-7 h-7 flex items-center justify-center mt-0.5 ${
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

      {/* ── Popovers (rendered at grid level, outside scroll) ── */}
      {expansion && (
        <EventExpansion
          event={expansion.event}
          anchorRect={expansion.rect}
          onClose={() => setExpansion(null)}
          onDelete={() => setExpansion(null)}
        />
      )}
      {quickCreate && (
        <QuickCreatePopover
          day={quickCreate.day}
          hour={quickCreate.hour}
          anchorRect={quickCreate.rect}
          onClose={() => setQuickCreate(null)}
        />
      )}

      {/* ── Scrollable grid body ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ minHeight: 0 }}
      >
        <div className="flex" style={{ height: totalGridHeight }}>
          {/* Time gutter */}
          <TimeGutter />

          {/* Day columns + NowIndicator overlay wrapper */}
          <div className="relative flex flex-1 min-w-0">
            {/* NowIndicator — only on current week */}
            {isCurrentWeek(currentWeekStart) && (
              <NowIndicator hourHeight={HOUR_HEIGHT} />
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

            {/* Day columns */}
            {weekDays.map((day, i) => (
              <DayColumn
                key={i}
                day={day}
                events={events}
                isToday={isToday(day)}
                currentHour={currentHour}
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
