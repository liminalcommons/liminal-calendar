/**
 * Convert `members.availability` (an array of UTC half-hour slot indices,
 * 0..335 representing Mon 00:00 .. Sun 23:30) into the `WindowConfig[]`
 * shape consumed by the slot engine.
 *
 * Storage convention:
 *   - 48 slots per day (30 min each), 7 days × 48 = 336 indices
 *   - Index 0 = Monday 00:00–00:30 UTC, index 1 = 00:30–01:00 UTC, …
 *   - Indices are stored in UTC so that two users in different tzs
 *     viewing each other's availability see a consistent absolute time
 *
 * Output convention (slots.ts `WindowConfig`):
 *   - dayOfWeek: 0=Mon..6=Sun in the OWNER'S local timezone
 *   - startMinute / endMinute: minutes from local-tz midnight
 *
 * Algorithm:
 *   1. Compute the owner's UTC→local offset in 30-min slots (sign matches
 *      Date#getTimezoneOffset-inverse — east of UTC is positive).
 *   2. Project each UTC slot index → local slot index, wrapping at 336.
 *   3. Bucket by local day.
 *   4. Collapse contiguous local slots within a day into [start, end) ranges.
 *
 * DST: offset is computed once with the current `now`. A booking horizon
 * that crosses a DST boundary will therefore shift by one hour relative
 * to wall-clock. Matches the behaviour of the existing `/profile`
 * AvailabilityGrid (same offset model) — fix in a future pass if needed.
 */

import type { WindowConfig } from './slots';

const SLOTS_PER_DAY = 48;
const TOTAL_SLOTS = 7 * SLOTS_PER_DAY;
const MINUTES_PER_SLOT = 30;

function getTzOffsetMinutes(timezone: string): number {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = now.toLocaleString('en-US', { timeZone: timezone });
    return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60_000;
  } catch {
    return 0;
  }
}

export function availabilityToWindows(
  utcSlots: number[] | null | undefined,
  timezone: string,
): WindowConfig[] {
  if (!utcSlots || utcSlots.length === 0) return [];

  const offsetMin = getTzOffsetMinutes(timezone || 'UTC');
  const offsetSlots = Math.round(offsetMin / MINUTES_PER_SLOT);

  const byDay: boolean[][] = Array.from({ length: 7 }, () =>
    Array<boolean>(SLOTS_PER_DAY).fill(false),
  );

  for (const raw of utcSlots) {
    if (!Number.isInteger(raw)) continue;
    let local = raw + offsetSlots;
    while (local < 0) local += TOTAL_SLOTS;
    while (local >= TOTAL_SLOTS) local -= TOTAL_SLOTS;
    const day = Math.floor(local / SLOTS_PER_DAY);
    const slot = local % SLOTS_PER_DAY;
    if (day >= 0 && day < 7 && slot >= 0 && slot < SLOTS_PER_DAY) {
      byDay[day][slot] = true;
    }
  }

  const windows: WindowConfig[] = [];
  for (let day = 0; day < 7; day++) {
    let runStart: number | null = null;
    for (let i = 0; i <= SLOTS_PER_DAY; i++) {
      const on = i < SLOTS_PER_DAY && byDay[day][i];
      if (on && runStart === null) {
        runStart = i;
      } else if (!on && runStart !== null) {
        windows.push({
          dayOfWeek: day,
          startMinute: runStart * MINUTES_PER_SLOT,
          endMinute: i * MINUTES_PER_SLOT,
          timezone: timezone || 'UTC',
        });
        runStart = null;
      }
    }
  }
  return windows;
}
