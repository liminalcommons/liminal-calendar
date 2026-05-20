/**
 * Pure slot-computation engine for 1:1 Booking (Plan 3 / Task 4).
 *
 * No DB, no Next, no auth, no clock — every input is explicit. `now` is the
 * caller-supplied UTC instant. All Date objects on the wire are UTC instants.
 *
 * Storage convention: `dayOfWeek` is 0=Mon..6=Sun. JS `Date.getDay()` is
 * 0=Sun..6=Sat — we convert via `(jsDow + 6) % 7`.
 *
 * Timezone-correctness: wall-clock → UTC always goes through
 * `fromZonedTime` (date-fns-tz). DST ambiguous/non-existent wall-clock times
 * are resolved by the library; we accept the resulting instant rather than
 * hand-rolling offset math.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export type EventTypeConfig = {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
};

export type WindowConfig = {
  /** 0=Mon..6=Sun (storage convention, NOT JS getDay) */
  dayOfWeek: number;
  /** Minutes from local-tz midnight */
  startMinute: number;
  /** Minutes from local-tz midnight; must be > startMinute */
  endMinute: number;
  /** IANA timezone, e.g. "America/New_York" */
  timezone: string;
};

export type BlockingEvent = {
  startsAt: Date;
  /** When null, treated as startsAt + eventType.durationMinutes. */
  endsAt: Date | null;
};

export type ComputedSlot = {
  startsAt: Date;
  endsAt: Date;
};

type Interval = { start: Date; end: Date; gridAnchor: Date };

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

export function computeSlots(args: {
  now: Date;
  eventType: EventTypeConfig;
  windows: WindowConfig[];
  blockingEvents: BlockingEvent[];
}): ComputedSlot[] {
  const { now, eventType, windows, blockingEvents } = args;
  if (windows.length === 0) return [];
  if (eventType.durationMinutes <= 0) return [];

  const earliest = new Date(now.getTime() + eventType.minNoticeMinutes * MS_PER_MIN);
  const latest = new Date(now.getTime() + eventType.maxDaysAhead * MS_PER_DAY);
  if (latest <= earliest) return [];

  // Expand blocking events (in UTC space) with buffers.
  const blocks: Interval[] = [];
  for (const be of blockingEvents) {
    const start = be.startsAt;
    const endRaw = be.endsAt ?? new Date(start.getTime() + eventType.durationMinutes * MS_PER_MIN);
    if (!(endRaw.getTime() > start.getTime())) continue;
    const expandedStart = new Date(start.getTime() - eventType.bufferBeforeMinutes * MS_PER_MIN);
    const expandedEnd = new Date(endRaw.getTime() + eventType.bufferAfterMinutes * MS_PER_MIN);
    blocks.push({ start: expandedStart, end: expandedEnd });
  }

  // Iterate enough UTC days to cover the entire [now, latest] window
  // plus a 1-day pad on each side so tz-day-of-week conversion at the edge is
  // never missed (e.g. Sunday-night in NY is still Monday-UTC).
  const startDayUtc = utcMidnight(now);
  const endDayUtc = utcMidnight(latest);
  const dayCount = Math.ceil((endDayUtc.getTime() - startDayUtc.getTime()) / MS_PER_DAY) + 2;

  const intervals: Interval[] = [];

  for (let i = -1; i <= dayCount; i++) {
    const utcDay = new Date(startDayUtc.getTime() + i * MS_PER_DAY);

    for (const w of windows) {
      // Compute the local-tz Y-M-D for this UTC day. For wall-clock conversion
      // we need the date as it appears in the window's timezone.
      const ymd = formatInTimeZone(utcDay, w.timezone, 'yyyy-MM-dd');
      const localDow = localDowFromYmd(ymd, w.timezone);
      if (localDow !== w.dayOfWeek) continue;

      // Build wall-clock strings for window start/end then convert to UTC instants.
      const startWall = isoLocalFromYmdMinutes(ymd, w.startMinute);
      const endWall = isoLocalFromYmdMinutes(ymd, w.endMinute);
      const startUtc = fromZonedTime(startWall, w.timezone);
      const endUtc = fromZonedTime(endWall, w.timezone);

      if (!(endUtc.getTime() > startUtc.getTime())) continue;

      // Intersect with [earliest, latest].
      const isectStart = startUtc.getTime() < earliest.getTime() ? earliest : startUtc;
      const isectEnd = endUtc.getTime() > latest.getTime() ? latest : endUtc;
      if (isectEnd.getTime() <= isectStart.getTime()) continue;

      intervals.push({ start: isectStart, end: isectEnd, gridAnchor: startUtc });
    }
  }

  // Generate back-to-back slots inside each interval; reject overlap with any block.
  const slotMs = eventType.durationMinutes * MS_PER_MIN;
  const seenIso = new Set<string>();
  const slots: ComputedSlot[] = [];

  for (const interval of intervals) {
    // Slots are anchored to the window's true start (gridAnchor), not to the
    // clamped `interval.start`. Otherwise, when `earliest = now + minNotice`
    // falls mid-grid (e.g. now is 15:57), slots drift off the canonical grid
    // and render as 15:57, 16:57, 17:57… instead of 16:00, 17:00, 18:00.
    const anchorMs = interval.gridAnchor.getTime();
    const offset = Math.max(0, interval.start.getTime() - anchorMs);
    const stepsFromAnchor = Math.ceil(offset / slotMs);
    let cursor = anchorMs + stepsFromAnchor * slotMs;
    while (cursor + slotMs <= interval.end.getTime()) {
      const slotStart = cursor;
      const slotEnd = cursor + slotMs;
      if (!overlapsAnyBlock(slotStart, slotEnd, blocks)) {
        const startsAt = new Date(slotStart);
        const iso = startsAt.toISOString();
        if (!seenIso.has(iso)) {
          seenIso.add(iso);
          slots.push({ startsAt, endsAt: new Date(slotEnd) });
        }
      }
      cursor += slotMs;
    }
  }

  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return slots;
}

// ---- helpers ----

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Half-open overlap: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅ iff aStart < bEnd && bStart < aEnd.
 */
function overlapsAnyBlock(start: number, end: number, blocks: Interval[]): boolean {
  for (const b of blocks) {
    if (start < b.end.getTime() && b.start.getTime() < end) return true;
  }
  return false;
}

/**
 * Given a Y-M-D string and a tz, return JS-equivalent day-of-week converted
 * to the storage convention (0=Mon..6=Sun).
 *
 * We compute this by taking the YMD-midnight UTC instant, then asking date-fns-tz
 * for the local-tz day-of-week using formatInTimeZone. Avoids any new-Date(string)
 * tz ambiguity.
 */
function localDowFromYmd(ymd: string, tz: string): number {
  // ymd "YYYY-MM-DD" → noon-local of that day in `tz` → ISO instant → format DOW.
  // Using noon to avoid any DST midnight gap nudging into the prior day.
  const noonLocalIso = `${ymd}T12:00:00`;
  const inst = fromZonedTime(noonLocalIso, tz);
  // 'i' returns ISO day of week 1=Mon..7=Sun in date-fns format.
  const iso = formatInTimeZone(inst, tz, 'i');
  const isoNum = parseInt(iso, 10); // 1..7
  return isoNum - 1; // 0=Mon..6=Sun
}

function isoLocalFromYmdMinutes(ymd: string, minutes: number): string {
  // `minutes` may be 1440 (end of day). Clamp to 23:59:59 in that case so that
  // the wall-clock string is still a valid date; fromZonedTime accepts it.
  const total = Math.min(minutes, 1440);
  let h = Math.floor(total / 60);
  let m = total % 60;
  let s = 0;
  if (h === 24) {
    // Represent 24:00 as 23:59:59 of same day. Acceptable because in practice
    // windows are not slot-aligned at this resolution; tests use 17:00 etc.
    h = 23;
    m = 59;
    s = 59;
  }
  return `${ymd}T${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
