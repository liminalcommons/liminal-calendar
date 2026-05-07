'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import type { DisplayEvent } from '@/lib/display-event';
import { toDateKey } from '@/lib/calendar-utils';
import { useUserTimezone } from '@/lib/timezone-utils';
import { HourCell } from './HourCell';
import { EventBlock } from './EventBlock';
import { DragSnapGhost } from './DragSnapGhost';
import { computeOverlapLayout } from './overlap';
import { SLOTS_PER_DAY } from '@/lib/golden-hours';
import { eventToMinutes } from '@/lib/event-time-display';
import { isMarketplaceSaturday, MARKETPLACE_DURATION_MIN } from '@/lib/marketplace-anchor';

function minutesToPx(minutes: number, offsets: number[], heights: number[]): number {
  const slot = Math.min(Math.floor(minutes / 30), 47);
  const frac = (minutes - slot * 30) / 30;
  return offsets[slot] + frac * heights[slot];
}

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
  /** ID of the event currently being dragged anywhere in the grid. The matching
   *  EventBlock in this column (if any) renders faded so the user sees where
   *  the event WAS while the float follows the cursor. */
  draggingEventId?: string | null;
  /** Day index of the snap target (0–6 within the visible week, -1 if not in
   *  this week's view). When this column's index matches, the snap-ghost
   *  outline is drawn at `snapTopPx` / `snapHeightPx`. */
  snapTargetDayIndex?: number;
  /** This column's own day index (0–6) for matching against snapTargetDayIndex. */
  dayIndex?: number;
  snapTopPx?: number;
  snapHeightPx?: number;
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
  draggingEventId,
  snapTargetDayIndex,
  dayIndex,
  snapTopPx,
  snapHeightPx,
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

  const userTz = useUserTimezone();

  // Hardcoded biweekly marquee for the Liminal Marketplace. Suppress when a
  // real "Liminal Marketplace" event row already exists on this day (item 3
  // of the rollout — once that event ships, the real row carries the link).
  const showMarketplaceMarker =
    mounted &&
    isMarketplaceSaturday(day) &&
    !dayEvents.some(e => e.title?.toLowerCase() === 'liminal marketplace');

  let marketplaceTopPx = 0;
  let marketplaceHeightPx = 0;
  let marketplaceTimeLabel = '';
  if (showMarketplaceMarker) {
    // Anchor the slot to that Saturday at 16:00 UTC (= 13:00 Brasília). Render
    // in the viewer's local TZ so it aligns with how events appear.
    const isoDate = `${dateKey}T16:00:00.000Z`;
    try {
      const hm = formatInTimeZone(new Date(isoDate), userTz, 'H:m');
      const [h, m] = hm.split(':').map(Number);
      const startMin = h * 60 + m;
      const endMin = startMin + MARKETPLACE_DURATION_MIN;
      marketplaceTopPx = minutesToPx(startMin, hourOffsets, hourHeights);
      marketplaceHeightPx = Math.max(
        minutesToPx(Math.min(endMin, 24 * 60), hourOffsets, hourHeights) - marketplaceTopPx,
        24,
      );
      marketplaceTimeLabel = formatInTimeZone(new Date(isoDate), userTz, 'h:mma').toLowerCase().replace(':00', '');
    } catch {
      // If TZ math fails, just hide the marker rather than render at slot 0.
      marketplaceHeightPx = 0;
    }
  }

  const overlapInput = dayEvents.map(e => ({
    id: e.id,
    ...eventToMinutes(e),
  }));

  const overlapMap = computeOverlapLayout(overlapInput);

  const isSnapTarget = dayIndex !== undefined && snapTargetDayIndex === dayIndex
    && snapTopPx !== undefined && snapHeightPx !== undefined;

  return (
    <div
      className="relative flex-1 min-w-0 border-l border-grove-border"
      data-day-index={dayIndex}
    >
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
            isDragging={draggingEventId === event.id}
          />
        );
      })}

      {isSnapTarget && (
        <DragSnapGhost topPx={snapTopPx!} heightPx={snapHeightPx!} />
      )}

      {showMarketplaceMarker && marketplaceHeightPx > 0 && (
        <Link
          href="/marketplace"
          className="absolute z-30 left-0 right-0 mx-1 rounded-md
                     border-2 border-dashed border-grove-accent/80
                     bg-grove-accent/10 hover:bg-grove-accent/20
                     transition-colors flex flex-col items-center justify-center
                     text-center px-2 group"
          style={{ top: marketplaceTopPx, height: marketplaceHeightPx }}
          title="Liminal Marketplace — bring an offer"
        >
          <span className="text-[10px] uppercase tracking-wider text-grove-accent font-semibold">
            ✦ Liminal Marketplace
          </span>
          {marketplaceHeightPx >= 40 && (
            <span className="text-[10px] text-grove-text-muted group-hover:text-grove-accent">
              {marketplaceTimeLabel} · bring an offer →
            </span>
          )}
        </Link>
      )}
    </div>
  );
});

export { DayColumn };
