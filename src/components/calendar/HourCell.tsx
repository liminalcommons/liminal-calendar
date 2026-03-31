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
  return hour >= 12 && hour <= 21;
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
  const isEven = hour % 2 === 0;

  let cellClass =
    'relative border-b border-grove-border/70 transition-colors';

  if (isCurrentHour) {
    cellClass += ' bg-grove-accent/15';
  } else if (isDay) {
    // Golden hours — warm, clearly distinct
    cellClass += isEven ? ' bg-grove-hour-golden' : ' bg-grove-hour-golden/80';
  } else {
    // Off-hours — noticeably darker/cooler
    cellClass += isEven ? ' bg-grove-hour-off' : ' bg-grove-hour-off/80';
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
