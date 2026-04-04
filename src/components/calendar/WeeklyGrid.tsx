'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, isToday, addWeeks, subWeeks, addDays, isBefore, parseISO } from 'date-fns';
import type { DisplayEvent } from '@/lib/display-event';
import { getWeekStart, getWeekDays, DAY_NAMES } from '@/lib/calendar-utils';
import { calendarSFX } from '@/lib/sound-manager';
import { useEvents } from '@/lib/use-events';
import { computeHourHeights, computeFisheyeHeights, computeHourOffsets } from '@/lib/golden-hours';
import { canCreateEvents } from '@/lib/auth-helpers';
import { MoonPhase } from '@/components/MoonPhase';
import { TimeGutter } from './TimeGutter';
import { DayColumn } from './DayColumn';
import { NowIndicator } from './NowIndicator';
import { EventExpansion } from './EventExpansion';
import { QuickCreatePopover } from './QuickCreatePopover';
import { AgendaSidebar } from './AgendaSidebar';

interface WeeklyGridProps {
  events: DisplayEvent[];
}

export function WeeklyGrid({ events: serverEvents }: WeeklyGridProps) {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'member';
  const canCreate = canCreateEvents(userRole);
  const { events, dissolvingIds, spawningIds, addEvent, removeEvent, updateEvent } = useEvents(serverEvents);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getWeekStart(new Date())
  );
  const [currentSlot, setCurrentSlot] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);
  });
  const [expansion, setExpansion] = useState<{ event: DisplayEvent; rect: DOMRect } | null>(null);
  const [quickCreate, setQuickCreate] = useState<{ day: Date; hour: number; rect: DOMRect } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [centerSlot, setCenterSlot] = useState(24); // slot 24 = 12:00 PM

  const weekDays = getWeekDays(currentWeekStart);

  // Fisheye slot heights — recompute when center slot changes
  const hourHeights = useMemo(() => computeFisheyeHeights(centerSlot), [centerSlot]);
  const hourOffsets = useMemo(() => computeHourOffsets(hourHeights), [hourHeights]);
  const totalGridHeight = hourHeights.reduce((s, h) => s + h, 0);

  // Update current slot every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentSlot(now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Fisheye scroll handler — compute which slot is at viewport center
  const lastCenterRef = useRef(24);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    let rafId: number;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const viewportCenter = el.scrollTop + el.clientHeight / 2;
        const offsets = computeHourOffsets(computeFisheyeHeights(lastCenterRef.current));
        let slot = 0;
        for (let i = 0; i < 48; i++) {
          if (offsets[i] > viewportCenter) break;
          slot = i;
        }
        const slotTop = offsets[slot];
        const slotH = computeFisheyeHeights(lastCenterRef.current)[slot];
        const frac = slotH > 0 ? (viewportCenter - slotTop) / slotH : 0;
        const newCenter = Math.round((slot + Math.min(frac, 1)) * 2) / 2; // quantize to 0.5
        if (newCenter !== lastCenterRef.current) {
          lastCenterRef.current = newCenter;
          setCenterSlot(newCenter);
        }
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Scroll to midday on initial load (slot 22 = 11 AM)
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || hasScrolledRef.current) return;
    const initialOffsets = computeHourOffsets(computeFisheyeHeights(24));
    el.scrollTop = initialOffsets[22] ?? 0;
    hasScrolledRef.current = true;
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
              className="flex-1 min-w-0 flex flex-col items-center justify-center py-1 border-l border-grove-border"
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

      {/* ── Main area: grid + agenda sidebar ── */}
      <div className="flex flex-1 min-h-0">
        {/* Grid body — scrollable */}
        <div
          ref={gridRef}
          className="flex-1 overflow-y-auto min-w-0"
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
                  currentHour={currentSlot}
                  hourHeights={hourHeights}
                  hourOffsets={hourOffsets}
                  dissolvingIds={dissolvingIds}
                  spawningIds={spawningIds}
                  onCellClick={canCreate ? handleCellClick : undefined}
                  onEventClick={handleEventClick}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Agenda sidebar — always visible */}
        <AgendaSidebar
          events={events}
          weekDays={weekDays}
          onEventClick={handleEventClick}
        />
      </div>
    </div>
  );
}
