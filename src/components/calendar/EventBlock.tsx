'use client';

import React, { useRef } from 'react';
import type { DisplayEvent } from '@/lib/display-event';

interface EventBlockProps {
  event: DisplayEvent;
  colIndex: number;
  colTotal: number;
  hourHeights: number[];
  hourOffsets: number[];
  isDissolving?: boolean;
  isSpawning?: boolean;
  onEventClick: (event: DisplayEvent, rect: DOMRect) => void;
}

function hashId(id: string): number {
  // Strip recurring instance suffix (e.g., "10-20260412" → "10") so all instances share the same color
  const baseId = id.replace(/-\d{8}$/, '');
  let h = 0;
  for (let i = 0; i < baseId.length; i++) {
    h = (h * 31 + baseId.charCodeAt(i)) >>> 0;
  }
  return h % 6;
}

const EVENT_GRADIENTS = [
  'linear-gradient(135deg, #7a8b6a 0%, #5a7a4a 100%)', // forest green
  'linear-gradient(135deg, #c4935a 0%, #6b5744 100%)', // warm brown
  'linear-gradient(135deg, #6a7f8b 0%, #4a5f7a 100%)', // slate blue
  'linear-gradient(135deg, #8b6a7f 0%, #6b4460 100%)', // muted plum
  'linear-gradient(135deg, #8b836a 0%, #6b6344 100%)', // olive
  'linear-gradient(135deg, #6a8b80 0%, #447a6b 100%)', // teal
];

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

function minutesToPx(minutes: number, slotOffsets: number[], slotHeights: number[]): number {
  const slot = Math.min(Math.floor(minutes / 30), 47);
  const frac = (minutes - slot * 30) / 30;
  return slotOffsets[slot] + frac * slotHeights[slot];
}

const EventBlock = React.memo(function EventBlock({
  event,
  colIndex,
  colTotal,
  hourHeights,
  hourOffsets,
  isDissolving,
  isSpawning,
  onEventClick,
}: EventBlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);

  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at ? new Date(event.ends_at) : new Date(startDate.getTime() + 60 * 60 * 1000);

  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const rawEndMinutes = endDate.getHours() * 60 + endDate.getMinutes();
  const endMinutes = Math.max(rawEndMinutes <= startMinutes ? 24 * 60 : rawEndMinutes, startMinutes + MIN_DISPLAY_MINUTES);

  const topPx = minutesToPx(startMinutes, hourOffsets, hourHeights);
  const bottomPx = minutesToPx(Math.min(endMinutes, 24 * 60), hourOffsets, hourHeights);
  const heightPx = Math.max(bottomPx - topPx, 16);

  const leftPct = (colIndex / colTotal) * 100;
  const widthPct = (1 / colTotal) * 100;

  const bgGradient = EVENT_GRADIENTS[hashId(event.id)];

  const recurrenceLabel = getRecurrenceLabel(event.recurrenceRule);

  // Animation class: spawn on creation, dissolve on deletion
  let animClass = '';
  if (isDissolving) animClass = 'glitch-dissolve';
  else if (isSpawning) animClass = 'glitch-spawn';

  return (
    <div
      ref={blockRef}
      className={`absolute rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer
                 shadow-sm hover:shadow-md hover:brightness-110
                 transition-all duration-300 ease-out z-10
                 border border-white/20 select-none
                 ${animClass}`}
      style={{
        top: topPx,
        height: heightPx,
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - 2px)`,
        background: bgGradient,
      }}
      onClick={(e) => onEventClick(event, (e.currentTarget as HTMLDivElement).getBoundingClientRect())}
      title={event.title}
    >
      <p className="text-white text-[11px] font-semibold leading-tight truncate">
        {event.title}
      </p>

      {heightPx >= 28 && (
        <p className="text-white/80 text-[10px] leading-tight truncate">
          {formatTime(event.starts_at)}
          {event.ends_at ? ` – ${formatTime(event.ends_at)}` : ''}
        </p>
      )}

      {heightPx >= 40 && event.attendees.total > 0 && (
        <p className="text-white/70 text-[10px] leading-tight">
          {event.attendees.going > 0
            ? `${event.attendees.going} going`
            : `${event.attendees.total} invited`}
        </p>
      )}

      {recurrenceLabel && heightPx >= 28 && (
        <span className="absolute bottom-0.5 right-1 text-[9px] text-white/60 font-mono">
          {recurrenceLabel}
        </span>
      )}
    </div>
  );
});

export { EventBlock };
