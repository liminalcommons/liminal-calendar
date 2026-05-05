'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DragEdgeIndicatorProps {
  side: 'left' | 'right';
  /** Bounding rect of the grid scroll container, in viewport coords. The strip
   *  spans the grid's full height so it's clearly anchored to where the week
   *  will advance, not just to the cursor. */
  gridRect: { top: number; bottom: number; left: number; right: number };
}

/**
 * Visual feedback when the cursor enters the cross-week edge zone during a
 * drag. Pulses a colored vertical strip with a chevron to signal that the
 * week is about to advance. The actual advance timer lives in WeeklyGrid;
 * this component is presentational.
 */
export function DragEdgeIndicator({ side, gridRect }: DragEdgeIndicatorProps) {
  const left = side === 'left' ? gridRect.left : gridRect.right - 56;
  const Chevron = side === 'left' ? ChevronLeft : ChevronRight;

  return (
    <div
      data-testid={`drag-edge-indicator-${side}`}
      className="fixed pointer-events-none z-[55] flex items-center justify-center"
      style={{
        top: gridRect.top,
        height: gridRect.bottom - gridRect.top,
        left,
        width: 56,
        background: side === 'left'
          ? 'linear-gradient(to right, rgba(122,139,106,0.28), rgba(122,139,106,0))'
          : 'linear-gradient(to left, rgba(122,139,106,0.28), rgba(122,139,106,0))',
        animation: 'drag-edge-pulse 700ms ease-in-out infinite alternate',
      }}
    >
      <Chevron
        size={28}
        className="text-grove-accent drop-shadow"
      />
      <style>{`
        @keyframes drag-edge-pulse {
          from { opacity: 0.55; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
