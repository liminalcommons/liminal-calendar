'use client';

import React, { useRef } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import type { DisplayEvent } from '@/lib/display-event';
import { useUserTimezone } from '@/lib/timezone-utils';

interface EventBlockProps {
  event: DisplayEvent;
  colIndex: number;
  colTotal: number;
  hourHeights: number[];
  hourOffsets: number[];
  isDissolving?: boolean;
  isSpawning?: boolean;
  onEventClick: (event: DisplayEvent, rect: DOMRect) => void;
  /** Owner-only drag affordance. When true, the block surfaces a draggable
   *  marker and forwards pointerdown to `onDragStart`. Admins who are not
   *  the event creator MUST receive `false` here (the calendar's permission
   *  rule: only the creator can move). */
  isOwner?: boolean;
  /** Pointerdown handler invoked only when `isOwner` is true. WeeklyGrid
   *  owns the drag lifecycle; EventBlock just emits the start signal. */
  onDragStart?: (event: DisplayEvent, e: React.PointerEvent<HTMLDivElement>) => void;
  /** True while this block is being actively dragged. Drives elevated styling
   *  and disables the release transition (snap motion is handled by
   *  `dragDeltaPx`). */
  isDragging?: boolean;
  /** Live snapped translateY for the dragging block. Ignored when
   *  `isDragging` is false. */
  dragDeltaPx?: number;
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

function formatTime(iso: string, timezone: string): string {
  try {
    const full = formatInTimeZone(new Date(iso), timezone, 'h:mma').toLowerCase();
    return full.replace(':00', '');
  } catch {
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes();
    const period = h >= 12 ? 'pm' : 'am';
    const displayH = h % 12 || 12;
    return m === 0 ? `${displayH}${period}` : `${displayH}:${String(m).padStart(2, '0')}${period}`;
  }
}

function hourMinuteInTz(iso: string, timezone: string): { h: number; m: number } {
  try {
    const hm = formatInTimeZone(new Date(iso), timezone, 'H:m');
    const [h, m] = hm.split(':').map(Number);
    return { h, m };
  } catch {
    const d = new Date(iso);
    return { h: d.getHours(), m: d.getMinutes() };
  }
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
  isOwner = false,
  onDragStart,
  isDragging = false,
  dragDeltaPx = 0,
}: EventBlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);

  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at ? new Date(event.ends_at) : new Date(startDate.getTime() + 60 * 60 * 1000);

  // Render times in the viewer's local timezone (matches Google/Apple Calendar).
  // `useUserTimezone` returns 'UTC' during SSR and swaps to the browser TZ
  // after hydration — the block may shift rows once on first paint.
  const userTz = useUserTimezone();
  const startHM = hourMinuteInTz(event.starts_at, userTz);
  const endHM = hourMinuteInTz(event.ends_at ?? new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(), userTz);
  const startMinutes = startHM.h * 60 + startHM.m;
  const rawEndMinutes = endHM.h * 60 + endHM.m;
  const endMinutes = Math.max(rawEndMinutes <= startMinutes ? 24 * 60 : rawEndMinutes, startMinutes + MIN_DISPLAY_MINUTES);

  const topPx = minutesToPx(startMinutes, hourOffsets, hourHeights);
  const bottomPx = minutesToPx(Math.min(endMinutes, 24 * 60), hourOffsets, hourHeights);
  const heightPx = Math.max(bottomPx - topPx, 16);

  const leftPct = (colIndex / colTotal) * 100;
  const widthPct = (1 / colTotal) * 100;

  const bgGradient = EVENT_GRADIENTS[hashId(event.id)];
  const hasImage = !!event.imageUrl;

  const recurrenceLabel = getRecurrenceLabel(event.recurrenceRule);

  // Animation class: spawn on creation, dissolve on deletion
  let animClass = '';
  if (isDissolving) animClass = 'glitch-dissolve';
  else if (isSpawning) animClass = 'glitch-spawn';

  // Cursor: owners see a "grab" affordance to signal draggability. While
  // dragging, the body cursor is locked to "grabbing" (set by WeeklyGrid),
  // so we don't override here. Non-owners get the default pointer for
  // popover-open behavior.
  const cursorClass = isOwner ? 'cursor-grab' : 'cursor-pointer';
  // While dragging: lift visually (stronger shadow, slight scale + opacity).
  // The release transition is enabled on non-dragging blocks so the snap-back
  // (or settle into final row) eases instead of jumping.
  const transform = isDragging
    ? `translate3d(0, ${dragDeltaPx}px, 0) scale(1.02)`
    : undefined;
  const transitionStyle = isDragging
    ? 'box-shadow 120ms ease-out'
    : 'transform 160ms cubic-bezier(0.22,1,0.36,1), box-shadow 160ms ease-out, opacity 160ms ease-out';
  const dragShadow = isDragging
    ? '0 12px 28px -6px rgba(0,0,0,0.55), 0 4px 12px -2px rgba(0,0,0,0.35)'
    : undefined;

  return (
    <div
      ref={blockRef}
      data-testid="event-block"
      data-draggable={isOwner ? 'true' : 'false'}
      data-dragging={isDragging ? 'true' : 'false'}
      className={`absolute rounded-md overflow-hidden ${cursorClass}
                 shadow-sm hover:shadow-md hover:brightness-110
                 z-10
                 border border-white/20 select-none
                 ${animClass}`}
      style={{
        top: topPx,
        height: heightPx,
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - 2px)`,
        background: hasImage ? undefined : bgGradient,
        transform,
        transition: transitionStyle,
        opacity: isDragging ? 0.92 : undefined,
        boxShadow: dragShadow,
        zIndex: isDragging ? 30 : undefined,
        // Disable native scroll/zoom gestures on owner blocks so a finger drag
        // never pages the grid instead of moving the event.
        touchAction: isOwner ? 'none' : undefined,
      }}
      onClick={(e) => onEventClick(event, (e.currentTarget as HTMLDivElement).getBoundingClientRect())}
      onPointerDown={isOwner && onDragStart ? (e) => onDragStart(event, e) : undefined}
      title={event.title}
    >
      {/* Banner image background */}
      {hasImage && (
        <>
          <img
            src={event.imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        </>
      )}

      {/* Content */}
      <div className="relative px-1.5 py-0.5">
        <p className="text-white text-[11px] font-semibold leading-tight truncate drop-shadow-sm">
          {event.title}
        </p>

        {heightPx >= 28 && (
          <p className="text-white/90 text-[10px] leading-tight truncate drop-shadow-sm">
            {formatTime(event.starts_at, userTz)}
            {event.ends_at ? ` – ${formatTime(event.ends_at, userTz)}` : ''}
          </p>
        )}

        {heightPx >= 40 && event.attendees.total > 0 && (
          <p className="text-white/80 text-[10px] leading-tight drop-shadow-sm">
            {event.attendees.going > 0
              ? `${event.attendees.going} going`
              : `${event.attendees.total} invited`}
          </p>
        )}

        {recurrenceLabel && heightPx >= 28 && (
          <span className="absolute bottom-0.5 right-1 text-[9px] text-white/70 font-mono drop-shadow-sm">
            {recurrenceLabel}
          </span>
        )}
      </div>
    </div>
  );
});

export { EventBlock };
