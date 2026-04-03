'use client';

import React from 'react';

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS_PER_DAY = 48;
const VISIBLE_START = 12; // 6 AM
const VISIBLE_END = 44;   // 10 PM
const VISIBLE_SLOTS = VISIBLE_END - VISIBLE_START;

const HOUR_LABELS = ['6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];

interface AvailabilityTimelineProps {
  /** UTC slot indices 0-335 */
  slots: number[];
  /** IANA timezone for display */
  timezone: string;
  /** Optional name shown above */
  name?: string;
  /** Compact mode for inline use (invitee picker etc) */
  compact?: boolean;
}

function getTzOffset(timezone: string): number {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = now.toLocaleString('en-US', { timeZone: timezone });
    return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000;
  } catch {
    return 0;
  }
}

function utcSlotsToLocalGrid(utcSlots: number[], offsetMinutes: number): boolean[][] {
  const grid: boolean[][] = Array.from({ length: 7 }, () => Array(SLOTS_PER_DAY).fill(false));
  const offsetSlots = Math.round(offsetMinutes / 30);
  for (const utcSlot of utcSlots) {
    let local = utcSlot + offsetSlots;
    if (local < 0) local += 336;
    if (local >= 336) local -= 336;
    const day = Math.floor(local / SLOTS_PER_DAY);
    const slot = local % SLOTS_PER_DAY;
    grid[day][slot] = true;
  }
  return grid;
}

export function AvailabilityTimeline({ slots, timezone, name, compact }: AvailabilityTimelineProps) {
  const offset = getTzOffset(timezone);
  const grid = utcSlotsToLocalGrid(slots, offset);
  const hasAny = slots.length > 0;

  if (!hasAny && compact) {
    return <p className="text-[10px] text-grove-text-dim italic">No availability set</p>;
  }

  return (
    <div className={compact ? '' : 'bg-grove-surface border border-grove-border rounded-xl p-4'}>
      {name && !compact && (
        <p className="text-xs font-semibold text-grove-text mb-3">{name}&apos;s availability</p>
      )}

      {/* Hour labels */}
      <div className="flex items-center mb-1" style={{ paddingLeft: compact ? 28 : 36 }}>
        {HOUR_LABELS.map((label, i) => (
          <span
            key={i}
            className="text-[8px] text-grove-text-dim"
            style={{ width: `${100 / (HOUR_LABELS.length)}%` }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Day rows */}
      <div className="space-y-1">
        {DAYS_SHORT.map((dayLabel, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-1.5">
            <span className={`${compact ? 'w-7 text-[9px]' : 'w-9 text-[10px]'} text-grove-text-muted font-medium text-right shrink-0`}>
              {dayLabel}
            </span>
            <div className={`flex-1 flex rounded-sm overflow-hidden ${compact ? 'h-2.5' : 'h-3.5'} bg-grove-border/20`}>
              {Array.from({ length: VISIBLE_SLOTS }, (_, si) => {
                const slot = VISIBLE_START + si;
                const isAvailable = grid[dayIdx][slot];
                const isHourBoundary = slot % 2 === 0;
                return (
                  <div
                    key={si}
                    className={`flex-1 ${
                      isAvailable
                        ? 'bg-grove-green/60'
                        : ''
                    } ${isHourBoundary && si > 0 ? 'border-l border-grove-border/10' : ''}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!hasAny && !compact && (
        <p className="text-xs text-grove-text-dim italic text-center mt-3">No availability set yet</p>
      )}
    </div>
  );
}
