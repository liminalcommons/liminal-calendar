'use client';

import React from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import type { DisplayEvent } from '@/lib/display-event';

interface DragFloatProps {
  event: DisplayEvent;
  cursorX: number;
  cursorY: number;
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
 * Floating clone of the dragged EventBlock that follows the cursor in real
 * time. Rendered fixed-positioned at the document level so it stays visible
 * even as the underlying grid changes (e.g., when the user crosses the week
 * edge and the visible week advances).
 *
 * Receives the original grab offset so the cursor remains at the same
 * relative point on the float as where the user grabbed the block.
 */
export function DragFloat({
  event,
  cursorX,
  cursorY,
  grabOffsetX,
  grabOffsetY,
  width,
  height,
  userTz,
}: DragFloatProps) {
  const left = cursorX - grabOffsetX;
  const top = cursorY - grabOffsetY;
  const bgGradient = EVENT_GRADIENTS[hashId(event.id)];
  const hasImage = !!event.imageUrl;
  const startStr = formatInTimeZone(new Date(event.starts_at), userTz, 'h:mma').toLowerCase().replace(':00', '');

  return (
    <div
      data-testid="drag-float"
      className="fixed pointer-events-none z-[60] rounded-md overflow-hidden
                 border border-white/30 select-none"
      style={{
        left,
        top,
        width,
        height,
        background: hasImage ? undefined : bgGradient,
        boxShadow: '0 18px 36px -8px rgba(0,0,0,0.55), 0 6px 14px -2px rgba(0,0,0,0.40)',
        opacity: 0.94,
        transform: 'scale(1.02)',
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
}
