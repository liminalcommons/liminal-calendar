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

function isDayHour(hour: number): boolean {
  return hour >= 6 && hour <= 17;
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
  const isDay = isDayHour(hour);

  const isEvenHour = hour % 2 === 0;

  let cellClass =
    'relative border-b border-grove-border/70 transition-colors';

  if (isCurrentHour) {
    cellClass += ' bg-grove-accent/10';
  } else if (isDay) {
    cellClass += isEvenHour ? ' bg-grove-surface/80' : ' bg-grove-border/15';
  } else {
    cellClass += isEvenHour ? ' bg-grove-border/15' : ' bg-grove-border/25';
  }

  if (onCellClick) {
    cellClass += ' cursor-pointer hover:bg-grove-accent/5';
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
