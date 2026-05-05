/**
 * Pure helpers that drive the send-reminders cron. The route wires them to
 * the real db / email / push clients; the helpers are testable in isolation.
 */

export interface DueEventRow {
  eventId: number;
  userId: string;
}

export function computeReminderWindow(now: Date, minMin: number, maxMin: number) {
  return {
    windowStart: new Date(now.getTime() + minMin * 60_000),
    windowEnd: new Date(now.getTime() + maxMin * 60_000),
  };
}

/**
 * Given the list of (event, user) pairs that fell in a reminder window and
 * the set of pairs that have already been dispatched for this window-type,
 * return the ones that should be sent this tick.
 */
export function filterUnsentRecipients<T extends DueEventRow>(
  due: T[],
  alreadySent: DueEventRow[],
): T[] {
  const sentSet = new Set(alreadySent.map((s) => `${s.eventId}:${s.userId}`));
  return due.filter((d) => !sentSet.has(`${d.eventId}:${d.userId}`));
}

export interface PushEventGroup {
  title: string;
  location: string | null;
  description: string | null;
  userIds: string[];
}

export interface PushDueRow extends DueEventRow {
  title: string;
  location: string | null;
  description: string | null;
}

/** Group push-due rows by event id, preserving user order, de-duping users per event. */
export function groupPushRecipientsByEvent(rows: PushDueRow[]): Map<number, PushEventGroup> {
  const out = new Map<number, PushEventGroup>();
  for (const r of rows) {
    const existing = out.get(r.eventId);
    if (existing) {
      if (!existing.userIds.includes(r.userId)) existing.userIds.push(r.userId);
    } else {
      out.set(r.eventId, {
        title: r.title,
        location: r.location,
        description: r.description,
        userIds: [r.userId],
      });
    }
  }
  return out;
}

/**
 * Extract the first http(s) link from an event's location + description
 * (Zoom / Google Meet / Jitsi links commonly pasted here). Falls back to the
 * event's detail page on the calendar app.
 */
export function pickPushClickUrl(
  eventId: number,
  location: string | null,
  description: string | null,
  fallbackBase = 'https://calendar.castalia.one',
): string {
  const text = `${location || ''} ${description || ''}`;
  const match = text.match(/https?:\/\/[^\s<"]+/);
  return match ? match[0] : `${fallbackBase}/events/${eventId}`;
}

export const PUSH_WINDOWS: {
  type: string;
  minMin: number;
  maxMin: number;
  title: (t: string) => string;
  body: string;
}[] = [
  { type: 'push-1hr',   minMin: 55, maxMin: 65, title: (t) => `${t} — in 1 hour`,     body: 'Starts in about 1 hour. Tap to view.' },
  { type: 'push-15min', minMin: 10, maxMin: 20, title: (t) => `${t} — starting soon`, body: 'Starts in 15 minutes. Tap to join.' },
  { type: 'push-start', minMin: -5, maxMin: 5,  title: (t) => `${t} — starting now`,  body: 'Starting now. Tap to join.' },
];

export const EMAIL_WINDOWS: [string, number, number][] = [
  ['24hr', 1435, 1445],
  ['1hr', 55, 65],
  ['15min', 10, 20],
];

/**
 * Post-event push: triggered after the event has ended to ask attendees
 * whether it actually happened. Mirrors PUSH_WINDOWS but its window axis is
 * "minutes since the event's effective end" rather than "minutes until start".
 *
 * Effective end = endsAt, falling back to startsAt + 60min (see eventEndedAt
 * in @/lib/event-time). Wide window (30 min .. 24 h) means a missed cron tick
 * is harmless; the (eventId, userId, type) unique key on notificationLog
 * prevents duplicates.
 */
export const POST_EVENT_PUSH_WINDOW = {
  type: 'push-post-event',
  minMinAfterEnd: 30,
  maxMinAfterEnd: 1440,
} as const;

/**
 * Returns the [windowStart, windowEnd] of effective-end timestamps the cron
 * should consider this tick. windowStart is the older boundary
 * (now - maxMinAfterEnd), windowEnd is the more recent one
 * (now - minMinAfterEnd). Events whose effective end falls in [start, end]
 * are eligible for the post-event push.
 */
export function computePostEventWindow(
  now: Date,
  minMinAfterEnd: number,
  maxMinAfterEnd: number,
) {
  return {
    windowStart: new Date(now.getTime() - maxMinAfterEnd * 60_000),
    windowEnd: new Date(now.getTime() - minMinAfterEnd * 60_000),
  };
}

/**
 * Drop (event, user) pairs that already have an attendance report row.
 * Mirror of filterUnsentRecipients but keyed against the attendanceReports
 * table rather than notificationLog — a user who has already reported
 * doesn't need another nudge.
 */
export function filterUnreportedRecipients<T extends DueEventRow>(
  due: T[],
  alreadyReported: DueEventRow[],
): T[] {
  const reportedSet = new Set(
    alreadyReported.map((s) => `${s.eventId}:${s.userId}`),
  );
  return due.filter((d) => !reportedSet.has(`${d.eventId}:${d.userId}`));
}

/**
 * Build the push payload for the post-event prompt. Deep-links to the event
 * detail page anchored at #attendance-report (the AttendanceReportSection
 * carries that DOM id), so a tap drops the user straight at the form.
 */
export function buildPostEventPayload(
  eventId: number,
  eventTitle: string,
  fallbackBase = 'https://calendar.castalia.one',
): { title: string; body: string; url: string; tag: string } {
  return {
    title: `How did ${eventTitle} go?`,
    body: 'Tap to mark whether it happened.',
    url: `${fallbackBase}/events/${eventId}#attendance-report`,
    tag: `post-event-${eventId}`,
  };
}
