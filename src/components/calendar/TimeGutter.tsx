'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { SLOTS_PER_DAY } from '@/lib/golden-hours';

export const DEFAULT_HOUR_HEIGHT = 32;

const SLOTS = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i);

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function isDayHour(hour: number): boolean {
  return hour >= 6 && hour <= 17;
}

interface TimeGutterProps {
  hourHeights: number[];
}

const TimeGutter = React.memo(function TimeGutter({ hourHeights }: TimeGutterProps) {
  return (
    <div
      className="flex-shrink-0 w-14 select-none"
      aria-hidden="true"
    >
      {SLOTS.map(slot => {
        const h = hourHeights[slot] ?? DEFAULT_HOUR_HEIGHT;
        const isHourBoundary = slot % 2 === 0;
        const hour = Math.floor(slot / 2);
        const compact = h < 20;

        return (
          <div
            key={slot}
            className="relative flex items-start justify-end pr-2 gap-0.5 overflow-hidden"
            style={{ height: h, transition: 'height 150ms ease-out' }}
          >
            {isHourBoundary && !compact && (
              <>
                <span className="mt-0.5 text-grove-text-dim">
                  {isDayHour(hour) ? (
                    <Sun size={8} strokeWidth={1.5} />
                  ) : (
                    <Moon size={8} strokeWidth={1.5} />
                  )}
                </span>
                <span className="leading-none text-grove-text-muted font-serif tabular-nums mt-0.5 text-[9px]">
                  {formatHourLabel(hour)}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
});

export { TimeGutter };
