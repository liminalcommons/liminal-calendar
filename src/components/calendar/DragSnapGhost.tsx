'use client';

import React from 'react';

interface DragSnapGhostProps {
  topPx: number;
  heightPx: number;
}

/**
 * Outlined indicator showing the snapped drop target row inside a DayColumn.
 * Width fills the column; positioned absolutely at the snapped top px. Renders
 * dashed because a solid block would visually compete with the actual events
 * already in that column.
 */
export function DragSnapGhost({ topPx, heightPx }: DragSnapGhostProps) {
  return (
    <div
      data-testid="drag-snap-ghost"
      className="absolute pointer-events-none z-20 rounded-md
                 border-2 border-dashed border-grove-accent/80
                 bg-grove-accent/10"
      style={{
        top: topPx,
        height: heightPx,
        left: 1,
        right: 1,
      }}
    />
  );
}
