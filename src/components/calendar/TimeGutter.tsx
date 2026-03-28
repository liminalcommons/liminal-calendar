'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';

export const HOUR_HEIGHT = 60; // px per hour slot

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function isDayHour(hour: number): boolean {
  return hour >= 6 && hour <= 17;
}

const TimeGutter = React.memo(function TimeGutter() {
  return (
    <div
      className="flex-shrink-0 w-16 select-none"
      aria-hidden="true"
    >
      {HOURS.map(hour => (
        <div
          key={hour}
          className="relative flex items-start justify-end pr-2 gap-0.5"
          style={{ height: HOUR_HEIGHT }}
        >
          {/* Icon */}
          <span className="mt-0.5 text-grove-text-dim">
            {isDayHour(hour) ? (
              <Sun size={9} strokeWidth={1.5} />
            ) : (
              <Moon size={9} strokeWidth={1.5} />
            )}
          </span>

          {/* Label */}
          <span className="text-[10px] leading-none text-grove-text-muted font-serif tabular-nums mt-0.5">
            {formatHourLabel(hour)}
          </span>
        </div>
      ))}
    </div>
  );
});

export { TimeGutter };
