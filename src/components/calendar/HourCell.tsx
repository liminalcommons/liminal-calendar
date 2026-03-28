'use client';

import React from 'react';
import { HOUR_HEIGHT } from './TimeGutter';

interface HourCellProps {
  day: Date;
  hour: number;
  isToday: boolean;
  currentHour?: number;
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
  onCellClick,
}: HourCellProps) {
  const isCurrentHour = isToday && currentHour === hour;
  const isDay = isDayHour(hour);

  let cellClass =
    'relative border-b border-grove-border/40 transition-colors';

  if (isCurrentHour) {
    cellClass += ' bg-grove-accent/10';
  } else if (isDay) {
    // Slightly lighter for daytime
    cellClass += ' bg-grove-surface/60';
  } else {
    // Night: slight grove-border tint
    cellClass += ' bg-grove-border/10';
  }

  if (onCellClick) {
    cellClass += ' cursor-pointer hover:bg-grove-accent/5';
  }

  return (
    <div
      className={cellClass}
      style={{ height: HOUR_HEIGHT }}
      onClick={onCellClick ? (e) => onCellClick(day, hour, (e.currentTarget as HTMLDivElement).getBoundingClientRect()) : undefined}
      aria-label={`${hour}:00`}
    />
  );
});

export { HourCell };
