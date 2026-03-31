'use client';

import React, { useEffect, useRef } from 'react';
import type { DisplayEvent } from '@/lib/display-event';
import { DEFAULT_HOUR_HEIGHT } from './TimeGutter';

interface EventBlockProps {
  event: DisplayEvent;
  colIndex: number;
  colTotal: number;
  hourHeight?: number;
  onEventClick: (event: DisplayEvent, rect: DOMRect) => void;
}

/** Simple string hash → 0 or 1, used to alternate accent/green gradient */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % 2;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const displayH = h % 12 || 12;
  return m === 0 ? `${displayH}${period}` : `${displayH}:${String(m).padStart(2, '0')}${period}`;
}

function getRecurrenceLabel(rule?: string): string | null {
  if (!rule) return null;
  const lower = rule.toLowerCase();
  if (lower.includes('daily')) return 'daily';
  if (lower.includes('weekly')) return 'weekly';
  if (lower.includes('monthly')) return 'monthly';
  if (lower.includes('yearly') || lower.includes('annual')) return 'yearly';
  return 'recurring';
}

const MIN_DISPLAY_MINUTES = 15;

const EventBlock = React.memo(function EventBlock({
  event,
  colIndex,
  colTotal,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  onEventClick,
}: EventBlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);

  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at ? new Date(event.ends_at) : new Date(startDate.getTime() + 60 * 60 * 1000);

  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const rawDuration = (endDate.getTime() - startDate.getTime()) / 60_000;
  const durationMinutes = Math.max(rawDuration, MIN_DISPLAY_MINUTES);

  const topPx = (startMinutes / 60) * hourHeight;
  const heightPx = (durationMinutes / 60) * hourHeight;
  const leftPct = (colIndex / colTotal) * 100;
  const widthPct = (1 / colTotal) * 100;

  const isGreen = hashId(event.id) === 1;

  const bgGradient = isGreen
    ? 'linear-gradient(135deg, #7a8b6a 0%, #5a7a4a 100%)'
    : 'linear-gradient(135deg, #c4935a 0%, #6b5744 100%)';

  const recurrenceLabel = getRecurrenceLabel(event.recurrenceRule);

  // Mount animation class
  useEffect(() => {
    const el = blockRef.current;
    if (!el) return;
    el.classList.add('glitch-spawn');
    const timer = setTimeout(() => el.classList.remove('glitch-spawn'), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={blockRef}
      className="absolute rounded-md px-1.5 py-1 overflow-hidden cursor-pointer
                 shadow-sm hover:shadow-md transition-shadow z-10
                 border border-white/20 select-none"
      style={{
        top: topPx,
        height: Math.max(heightPx, 20),
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - 2px)`,
        background: bgGradient,
      }}
      onClick={(e) => onEventClick(event, (e.currentTarget as HTMLDivElement).getBoundingClientRect())}
      title={event.title}
    >
      {/* Title — always visible */}
      <p className="text-white text-[11px] font-semibold leading-tight truncate">
        {event.title}
      </p>

      {/* Time label — show if enough height */}
      {heightPx >= 30 && (
        <p className="text-white/80 text-[10px] leading-tight truncate">
          {formatTime(event.starts_at)}
          {event.ends_at ? ` – ${formatTime(event.ends_at)}` : ''}
        </p>
      )}

      {/* Attendee count — show if enough height */}
      {heightPx >= 40 && event.attendees.total > 0 && (
        <p className="text-white/70 text-[10px] leading-tight">
          {event.attendees.going > 0
            ? `${event.attendees.going} going`
            : `${event.attendees.total} invited`}
        </p>
      )}

      {/* Recurrence badge */}
      {recurrenceLabel && (
        <span className="absolute bottom-0.5 right-1 text-[9px] text-white/60 font-mono">
          {recurrenceLabel}
        </span>
      )}
    </div>
  );
});

export { EventBlock };
