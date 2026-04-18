import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { DisplayEvent } from './display-event';

type Step = { days?: number; months?: number };

/**
 * Expand recurring events into individual instances within a date range.
 * Each instance gets a unique ID like "originalId-YYYYMMDD" so React keys work.
 * Non-recurring events pass through unchanged.
 *
 * Advancement preserves the event's wall-clock time in `event.timezone`, so
 * expansion is deterministic regardless of whether it runs on a UTC server
 * or a UK browser — DST boundaries are handled correctly by fromZonedTime.
 */
export function expandRecurringEvents(
  events: DisplayEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): DisplayEvent[] {
  const result: DisplayEvent[] = [];

  for (const event of events) {
    if (!event.recurrenceRule) {
      result.push(event);
      continue;
    }

    const step = getStep(event.recurrenceRule);
    if (!step) {
      result.push(event);
      continue;
    }

    const tz = event.timezone || 'UTC';
    const originalStart = new Date(event.starts_at);
    const originalEnd = event.ends_at ? new Date(event.ends_at) : null;
    const duration = originalEnd ? originalEnd.getTime() - originalStart.getTime() : 3600000;

    // Wall-clock components in the event's timezone — this is what we preserve.
    const base = extractWallClock(originalStart, tz);

    let count = 0;
    const maxInstances = 52;

    while (count < maxInstances) {
      const wc = advanceWallClock(base, step, count);
      const instanceStartDate = fromZonedTime(toIsoLocal(wc), tz);
      if (instanceStartDate >= rangeEnd) break;

      if (instanceStartDate >= rangeStart || isSameDayUTC(instanceStartDate, rangeStart)) {
        const instanceStart = instanceStartDate.toISOString();
        const instanceEnd = new Date(instanceStartDate.getTime() + duration).toISOString();
        const dateKey = `${wc.y}${pad(wc.mo)}${pad(wc.d)}`;

        result.push({
          ...event,
          id: count === 0 ? event.id : `${event.id}-${dateKey}`,
          starts_at: instanceStart,
          ends_at: instanceEnd,
        });
      }
      count++;
    }
  }

  return result;
}

function getStep(rule: string): Step | null {
  switch (rule) {
    case 'daily': return { days: 1 };
    case 'weekly': return { days: 7 };
    case 'fortnightly': return { days: 14 };
    case 'monthly': return { months: 1 };
    default: return null;
  }
}

type WallClock = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function extractWallClock(date: Date, tz: string): WallClock {
  const parts = formatInTimeZone(date, tz, "yyyy-MM-dd-HH-mm-ss").split('-').map(Number);
  return { y: parts[0], mo: parts[1], d: parts[2], h: parts[3], mi: parts[4], s: parts[5] };
}

function advanceWallClock(base: WallClock, step: Step, count: number): WallClock {
  if (step.months) {
    const totalMonths = base.mo - 1 + step.months * count;
    const y = base.y + Math.floor(totalMonths / 12);
    const mo = (totalMonths % 12 + 12) % 12 + 1;
    const lastDay = daysInMonth(y, mo);
    const d = Math.min(base.d, lastDay);
    return { ...base, y, mo, d };
  }
  // days: use UTC arithmetic on the date portion only, then re-attach wall h:mi:s.
  const anchor = Date.UTC(base.y, base.mo - 1, base.d);
  const shifted = new Date(anchor + (step.days ?? 0) * count * 86400000);
  return {
    ...base,
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
  };
}

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoLocal(wc: WallClock): string {
  return `${wc.y}-${pad(wc.mo)}-${pad(wc.d)}T${pad(wc.h)}:${pad(wc.mi)}:${pad(wc.s)}`;
}

function isSameDayUTC(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
}

