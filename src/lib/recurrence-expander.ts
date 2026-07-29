import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { DisplayEvent } from './display-event';

const WEEKDAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayAbbr = (typeof WEEKDAY_ABBR)[number];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const POSITION_NAMES: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };

type ParsedRule =
  | { kind: 'interval-days'; days: number }
  | { kind: 'interval-months' }
  | { kind: 'monthly-weekday'; pos: number; weekday: number };

/**
 * Parse a `recurrenceRule` string into a structured rule. Handles the four
 * legacy literal values plus two parameterized forms:
 *   - `every_${n}_weeks`        — a custom weekly interval (n >= 1)
 *   - `monthly_${pos}_${abbr}`  — nth (1-4) or last (-1) weekday of the month,
 *                                 e.g. `monthly_-1_thu` = "last Thursday"
 * Returns null for `'none'`, unrecognized strings, or malformed parameters.
 */
export function parseRecurrenceRule(rule: string): ParsedRule | null {
  switch (rule) {
    case 'daily': return { kind: 'interval-days', days: 1 };
    case 'weekly': return { kind: 'interval-days', days: 7 };
    case 'fortnightly': return { kind: 'interval-days', days: 14 };
    case 'monthly': return { kind: 'interval-months' };
  }

  const everyWeeks = rule.match(/^every_(\d+)_weeks$/);
  if (everyWeeks) {
    const n = parseInt(everyWeeks[1], 10);
    if (n >= 1) return { kind: 'interval-days', days: n * 7 };
    return null;
  }

  const monthlyWeekday = rule.match(/^monthly_(-?\d+)_([a-z]{3})$/);
  if (monthlyWeekday) {
    const pos = parseInt(monthlyWeekday[1], 10);
    const weekday = WEEKDAY_ABBR.indexOf(monthlyWeekday[2] as WeekdayAbbr);
    if (weekday !== -1 && (pos === -1 || (pos >= 1 && pos <= 4))) {
      return { kind: 'monthly-weekday', pos, weekday };
    }
  }

  return null;
}

/** Human-readable label for a recurrence rule, e.g. for badges and chips. */
export function describeRecurrenceRule(rule: string): string {
  switch (rule) {
    case 'daily': return 'Daily';
    case 'weekly': return 'Weekly';
    case 'fortnightly': return 'Fortnightly';
    case 'monthly': return 'Monthly';
  }

  const everyWeeks = rule.match(/^every_(\d+)_weeks$/);
  if (everyWeeks) {
    const n = parseInt(everyWeeks[1], 10);
    return `Every ${n} weeks`;
  }

  const monthlyWeekday = rule.match(/^monthly_(-?\d+)_([a-z]{3})$/);
  if (monthlyWeekday) {
    const pos = parseInt(monthlyWeekday[1], 10);
    const weekday = WEEKDAY_ABBR.indexOf(monthlyWeekday[2] as WeekdayAbbr);
    if (weekday !== -1 && POSITION_NAMES[pos]) {
      const posLabel = POSITION_NAMES[pos];
      const posCaps = posLabel.charAt(0).toUpperCase() + posLabel.slice(1);
      return `Monthly — ${posCaps} ${WEEKDAY_NAMES[weekday]}`;
    }
  }

  return rule;
}

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

    const rule = parseRecurrenceRule(event.recurrenceRule);
    if (!rule) {
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
      const wc = advanceWallClock(base, rule, count);
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

type WallClock = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function extractWallClock(date: Date, tz: string): WallClock {
  const parts = formatInTimeZone(date, tz, "yyyy-MM-dd-HH-mm-ss").split('-').map(Number);
  return { y: parts[0], mo: parts[1], d: parts[2], h: parts[3], mi: parts[4], s: parts[5] };
}

function advanceWallClock(base: WallClock, rule: ParsedRule, count: number): WallClock {
  if (rule.kind === 'interval-months') {
    const totalMonths = base.mo - 1 + count;
    const y = base.y + Math.floor(totalMonths / 12);
    const mo = (totalMonths % 12 + 12) % 12 + 1;
    const lastDay = daysInMonth(y, mo);
    const d = Math.min(base.d, lastDay);
    return { ...base, y, mo, d };
  }

  if (rule.kind === 'monthly-weekday') {
    const totalMonths = base.mo - 1 + count;
    const y = base.y + Math.floor(totalMonths / 12);
    const mo = (totalMonths % 12 + 12) % 12 + 1;
    const d = nthWeekdayOfMonth(y, mo, rule.weekday, rule.pos);
    return { ...base, y, mo, d };
  }

  // interval-days: use UTC arithmetic on the date portion only, then re-attach wall h:mi:s.
  const anchor = Date.UTC(base.y, base.mo - 1, base.d);
  const shifted = new Date(anchor + rule.days * count * 86400000);
  return {
    ...base,
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
  };
}

/**
 * Day-of-month for the nth (1-4) or last (-1) occurrence of `weekday`
 * (0=Sun..6=Sat) in the given month. Positions 1-4 always exist (every
 * month has >= 28 days = 4 full weeks); -1 (last) always exists too.
 */
function nthWeekdayOfMonth(y: number, mo: number, weekday: number, pos: number): number {
  if (pos > 0) {
    const firstDow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
    return 1 + ((weekday - firstDow + 7) % 7) + (pos - 1) * 7;
  }
  const last = daysInMonth(y, mo);
  const lastDow = new Date(Date.UTC(y, mo - 1, last)).getUTCDay();
  return last - ((lastDow - weekday + 7) % 7);
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
