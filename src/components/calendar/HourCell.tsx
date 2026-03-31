'use client';

import React from 'react';

interface HourCellProps {
  day: Date;
  hour: number;
  isToday: boolean;
  currentHour?: number;
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
  const isCurrentHour = isToday && currentHour === hour;
  const isEven = hour % 2 === 0;

  let cellClass =
    'relative border-b border-grove-border transition-colors';

  if (isCurrentHour) {
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
      style={{ height: hourHeight }}
      onClick={onCellClick ? (e) => onCellClick(day, hour, (e.currentTarget as HTMLDivElement).getBoundingClientRect()) : undefined}
      aria-label={`${hour}:00`}
    />
  );
});

export { HourCell };
