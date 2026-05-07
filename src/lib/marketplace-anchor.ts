// Hardcoded anchor for the biweekly Liminal Marketplace session.
// First session: Saturday 2026-05-16, 13:00–14:00 Brasília time (UTC-3).
// Sessions recur every 2 weeks (fortnightly) on Saturdays.

export const MARKETPLACE_FIRST_SESSION_UTC = '2026-05-16T16:00:00.000Z';
export const MARKETPLACE_DURATION_MIN = 60;
export const MARKETPLACE_TIMEZONE = 'America/Sao_Paulo';

const FIRST_SESSION_MS = Date.parse(MARKETPLACE_FIRST_SESSION_UTC);
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Returns true if `day` falls on a Marketplace Saturday — i.e. it is a
 * Saturday AND the difference (in whole days) from the first session is a
 * multiple of 14. `day` is interpreted in the LOCAL timezone of the runtime;
 * the calendar uses local-day rendering, so this matches user-visible
 * weekday/date alignment.
 */
export function isMarketplaceSaturday(day: Date): boolean {
  if (day.getDay() !== 6) return false;
  // Compare midnight-aligned to avoid time-of-day skew.
  const dayMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const firstMidnight = (() => {
    const d = new Date(FIRST_SESSION_MS);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();
  const diff = dayMidnight - firstMidnight;
  if (diff < 0) {
    // Past sessions still count (so historical view shows the marker too).
    return Math.abs(diff) % FOURTEEN_DAYS_MS === 0;
  }
  return diff % FOURTEEN_DAYS_MS === 0;
}

/**
 * The slot's start hour (decimal, local Brasília time → user's local time
 * approximation). We store the canonical start in UTC and let the grid use
 * its existing local-time projection. For the marker tile's vertical
 * positioning, the WeeklyGrid hour math operates in viewer-local time, so
 * we just expose the UTC instant — DayColumn computes start/end hours from it.
 */
export function getMarketplaceSlotForDay(day: Date): { start: Date; end: Date } {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
  // Apply the same UTC time-of-day to that day's local midnight + offset.
  const anchor = new Date(FIRST_SESSION_MS);
  start.setHours(anchor.getHours(), anchor.getMinutes(), 0, 0);
  const end = new Date(start.getTime() + MARKETPLACE_DURATION_MIN * 60 * 1000);
  return { start, end };
}
