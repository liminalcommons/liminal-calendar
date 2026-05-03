/**
 * Shared event-time helpers — single source of truth for "has the event
 * ended yet?" used by both the attendance-report route (server-side gate)
 * and the AttendanceReportSection (UI visibility gate).
 *
 * Accepts BOTH camelCase (Drizzle row) and snake_case (JSON wire) shapes
 * because both flow through this code path. camelCase wins when both
 * present — Drizzle's typed shape is the source of truth.
 */

const ONE_HOUR_MS = 60 * 60 * 1000;

export interface EventTimeFields {
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  starts_at?: Date | string | null;
  ends_at?: Date | string | null;
}

function readField(
  obj: EventTimeFields,
  camel: 'startsAt' | 'endsAt',
  snake: 'starts_at' | 'ends_at',
): Date | string | null {
  return obj[camel] ?? obj[snake] ?? null;
}

/**
 * Returns the ms timestamp at which the event is considered ended.
 * Fallback: when endsAt is missing, treat the event as ending startsAt + 1h.
 * Sentinel: when both startsAt and endsAt are null, returns 0 (defensive —
 * callers should treat this as "do not assume ended").
 */
export function eventEndedAt(event: EventTimeFields): number {
  const ends = readField(event, 'endsAt', 'ends_at');
  const starts = readField(event, 'startsAt', 'starts_at');
  if (ends) return new Date(ends as Date | string).getTime();
  if (starts) return new Date(starts as Date | string).getTime() + ONE_HOUR_MS;
  return 0;
}

/**
 * Returns true if Date.now() is at or past eventEndedAt(event), with a
 * defensive carve-out: when both startsAt and endsAt are null, returns
 * false rather than mistakenly treating the no-times sentinel (0) as
 * "ended". Without that carve-out every events-without-times row would
 * unlock the attendance report UI for the entire epoch since 1970.
 */
export function eventHasEnded(event: EventTimeFields): boolean {
  const ends = readField(event, 'endsAt', 'ends_at');
  const starts = readField(event, 'startsAt', 'starts_at');
  if (ends === null && starts === null) return false;
  return Date.now() >= eventEndedAt(event);
}
