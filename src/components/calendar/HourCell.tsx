'use client';

import React from 'react';

interface HourCellProps {
  day: Date;
  hour: number;    // slot index 0-47
  isToday: boolean;
  currentHour?: number; // current slot index
  hourHeight: number;
  onCellClick?: (day: Date, hour: number, rect: DOMRect) => void;
}

const HourCell = React.memo(function HourCell({
  day,
  hour,
  isToday,
  currentHour,
  hourHeight,
  onCellClick,
}: HourCellProps) {
  const isCurrentSlot = isToday && currentHour === hour;
  const isEven = hour % 2 === 0; // alternates every 30 min
  const isHourBoundary = hour % 2 === 0; // bold line on the hour

  let cellClass = `relative transition-colors ${
    isHourBoundary ? 'border-b border-grove-border' : 'border-b border-grove-border/30'
  }`;

  if (isCurrentSlot) {
    cellClass += ' bg-grove-accent/15';
  } else if (isEven) {
    cellClass += ' bg-grove-surface/80';
  } else {
    cellClass += ' bg-grove-border/20';
  }

  if (onCellClick) {
    cellClass += ' cursor-pointer hover:bg-grove-accent/10';
  }

  return (
    <div
      className={cellClass}
      style={{ height: hourHeight, transition: 'height 150ms ease-out' }}
      onClick={onCellClick ? (e) => onCellClick(day, hour, (e.currentTarget as HTMLDivElement).getBoundingClientRect()) : undefined}
      aria-label={`${Math.floor(hour / 2)}:${hour % 2 === 0 ? '00' : '30'}`}
    />
  );
});

export { HourCell };
