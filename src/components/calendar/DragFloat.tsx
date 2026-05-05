'use client';

import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import type { DisplayEvent } from '@/lib/display-event';

interface DragFloatProps {
  event: DisplayEvent;
  /** Initial cursor position — used once at mount to position the float
   *  before the first pointermove tick. After mount, position is owned by
   *  WeeklyGrid via the forwarded ref (direct DOM mutation, no React state).
   *  This avoids a setState-per-pixel re-render storm that made the float
   *  feel laggy and flickery. */
  initialCursorX: number;
  initialCursorY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  width: number;
  height: number;
  userTz: string;
}

// Same gradient pool as EventBlock — keep in sync (small enough to duplicate
// rather than couple via a shared module).
const EVENT_GRADIENTS = [
  'linear-gradient(135deg, #7a8b6a 0%, #5a7a4a 100%)',
  'linear-gradient(135deg, #c4935a 0%, #6b5744 100%)',
  'linear-gradient(135deg, #6a7f8b 0%, #4a5f7a 100%)',
  'linear-gradient(135deg, #8b6a7f 0%, #6b4460 100%)',
  'linear-gradient(135deg, #8b836a 0%, #6b6344 100%)',
  'linear-gradient(135deg, #6a8b80 0%, #447a6b 100%)',
];

function hashId(id: string): number {
  const baseId = id.replace(/-\d{8}$/, '');
  let h = 0;
  for (let i = 0; i < baseId.length; i++) h = (h * 31 + baseId.charCodeAt(i)) >>> 0;
  return h % 6;
}

/**
 * Floating clone of the dragged EventBlock. Position is JS-owned (the parent
 * mutates `style.transform` on every native pointermove), so React never
 * fights for the cursor. The component intentionally has NO `transform` in
 * its JSX style — that lets the parent's DOM updates persist across React
 * re-renders triggered by snap/edge state changes.
 */
export const DragFloat = forwardRef<HTMLDivElement, DragFloatProps>(function DragFloat(
  { event, initialCursorX, initialCursorY, grabOffsetX, grabOffsetY, width, height, userTz },
  ref,
) {
  const innerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);

  // Set initial transform AFTER mount so the float lands at the cursor
  // immediately. Subsequent updates come via the forwarded ref.
  useLayoutEffect(() => {
    if (!innerRef.current) return;
    const x = initialCursorX - grabOffsetX;
    const y = initialCursorY - grabOffsetY;
    innerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.02)`;
  }, []); // mount-only

  const bgGradient = EVENT_GRADIENTS[hashId(event.id)];
  const hasImage = !!event.imageUrl;
  const startStr = formatInTimeZone(new Date(event.starts_at), userTz, 'h:mma').toLowerCase().replace(':00', '');

  return (
    <div
      ref={innerRef}
      data-testid="drag-float"
      className="fixed top-0 left-0 pointer-events-none z-[60] rounded-md overflow-hidden
                 border border-white/30 select-none will-change-transform"
      style={{
        width,
        height,
        background: hasImage ? undefined : bgGradient,
        boxShadow: '0 18px 36px -8px rgba(0,0,0,0.55), 0 6px 14px -2px rgba(0,0,0,0.40)',
        opacity: 0.94,
        // NB: NO `transform` here on purpose — owned by parent via ref.
      }}
    >
      {hasImage && (
        <>
          <img src={event.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        </>
      )}
      <div className="relative px-1.5 py-0.5">
        <p className="text-white text-[11px] font-semibold leading-tight truncate drop-shadow-sm">
          {event.title}
        </p>
        {height >= 28 && (
          <p className="text-white/90 text-[10px] leading-tight truncate drop-shadow-sm">
            {startStr}
          </p>
        )}
      </div>
    </div>
  );
});
