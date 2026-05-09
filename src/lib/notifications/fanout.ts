import { and, eq, inArray, ne } from 'drizzle-orm';
import { rsvps, events, eventInvitations, type Event } from '@/lib/db/schema';
import { createNotification } from '@/lib/notifications/inbox/repo';
import { sendPushToUsers } from '@/lib/notifications/push';

/**
 * Domain-trigger fan-out. Distinct from the cron-driven send-reminders
 * pipeline:
 *
 *   Cron triggers (A1, A2): horizon-based, opt-in via notificationPreferences,
 *                            once-per-(event, user, type) via notificationLog.
 *
 *   Domain triggers (A3, A4, C2): event-driven, no opt-out gate (yet),
 *                                  many-per-event allowed (each edit / report
 *                                  is its own thing). No notificationLog
 *                                  involvement — inbox row IS the record.
 *
 * Each helper returns counts so callers can log/observe.
 */

export interface FanoutResult {
  inboxCreated: number;
  pushSent: number;
  pushFailed: number;
}

const ZERO: FanoutResult = { inboxCreated: 0, pushSent: 0, pushFailed: 0 };

export interface EventLite {
  id: number;
  title: string;
  description?: string | null;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  timezone?: string | null;
  location?: string | null;
}

export type ChangedField =
  | 'title'
  | 'description'
  | 'startsAt'
  | 'endsAt'
  | 'timezone'
  | 'location';

export interface EventDiff {
  changedFields: ChangedField[];
  summary: string;
}

function tsEq(a: Date | string | null | undefined, b: Date | string | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function strEq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '') === (b ?? '');
}

const FIELD_LABELS: Record<ChangedField, string> = {
  title: 'title',
  description: 'description',
  startsAt: 'start time',
  endsAt: 'end time',
  timezone: 'timezone',
  location: 'location',
};

function summarize(changed: ChangedField[]): string {
  if (changed.length === 0) return 'Details updated';
  const labels = changed.map((c) => FIELD_LABELS[c]);
  if (labels.length === 1) return `${labels[0][0].toUpperCase()}${labels[0].slice(1)} updated`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} updated`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]} updated`;
}

/**
 * Diff two event snapshots. Returns null when nothing notification-worthy
 * changed (image, recurrence rule, etc. don't trigger A3).
 */
export function diffEventForNotification(before: EventLite, after: EventLite): EventDiff | null {
  const changed: ChangedField[] = [];
  if (!strEq(before.title, after.title)) changed.push('title');
  if (!strEq(before.description, after.description)) changed.push('description');
  if (!tsEq(before.startsAt, after.startsAt)) changed.push('startsAt');
  if (!tsEq(before.endsAt, after.endsAt)) changed.push('endsAt');
  if (!strEq(before.timezone, after.timezone)) changed.push('timezone');
  if (!strEq(before.location, after.location)) changed.push('location');
  if (changed.length === 0) return null;
  return { changedFields: changed, summary: summarize(changed) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface Actor {
  id: string | null;
  name: string | null;
}

/**
 * Look up RSVP recipients for fan-out. Includes yes + interested, excludes
 * the actor themselves (host editing their own event shouldn't notify
 * themselves).
 */
async function listRecipients(db: Db, eventId: number, excludeUserId: string | null): Promise<string[]> {
  const where = excludeUserId
    ? and(
        eq(rsvps.eventId, eventId),
        ne(rsvps.status, 'no'),
        ne(rsvps.userId, excludeUserId),
      )
    : and(eq(rsvps.eventId, eventId), ne(rsvps.status, 'no'));
  const rows = await db
    .select({ userId: rsvps.userId })
    .from(rsvps)
    .where(where);
  return [...new Set((rows as { userId: string }[]).map((r) => r.userId))];
}

/**
 * Look up invitee userIds for an event (from event_invitations), excluding
 * the actor. Returns empty array if none.
 */
async function listInviteeIds(db: Db, eventId: number, excludeUserId: string | null): Promise<string[]> {
  const rows = await db
    .select({ inviteeUserId: eventInvitations.inviteeUserId })
    .from(eventInvitations)
    .where(eq(eventInvitations.eventId, eventId));
  const ids = (rows as { inviteeUserId: string }[]).map((r) => r.inviteeUserId);
  return excludeUserId ? ids.filter((id) => id !== excludeUserId) : ids;
}

/**
 * Union of RSVP recipients + invitees, deduped by userId, excluding actor.
 * Used for event.changed and event.cancelled so both sets are notified.
 */
async function listRecipientsWithInvitees(
  db: Db,
  eventId: number,
  excludeUserId: string | null,
): Promise<string[]> {
  const [rsvpIds, inviteeIds] = await Promise.all([
    listRecipients(db, eventId, excludeUserId),
    listInviteeIds(db, eventId, excludeUserId),
  ]);
  return [...new Set([...rsvpIds, ...inviteeIds])];
}

async function fanoutToRecipients(
  db: Db,
  recipients: string[],
  inboxRow: {
    type: string;
    eventId: number | null;
    actorId: string | null;
    actorName: string | null;
    title: string;
    body: string | null;
    url: string;
    payload: Record<string, unknown>;
  },
  pushPayload: { title: string; body: string; url: string; tag: string } | null,
): Promise<FanoutResult> {
  if (recipients.length === 0) return ZERO;

  let inboxCreated = 0;
  for (const userId of recipients) {
    try {
      await createNotification(db, { userId, ...inboxRow });
      inboxCreated++;
    } catch (err) {
      console.error('[fanout] inbox write failed for', userId, err);
    }
  }

  let pushSent = 0;
  let pushFailed = 0;
  if (pushPayload) {
    try {
      const result = await sendPushToUsers(recipients, pushPayload);
      pushSent = result.sent;
      pushFailed = result.failed;
    } catch (err) {
      console.error('[fanout] push send failed', err);
      pushFailed = recipients.length;
    }
  }

  return { inboxCreated, pushSent, pushFailed };
}

/** A3 — host edited the event. Notify RSVP=yes/interested users + invitees (not the host). */
export async function fanoutEventChanged(
  db: Db,
  event: EventLite & { creatorId?: string },
  diff: EventDiff,
  actor: Actor,
  baseUrl = 'https://calendar.castalia.one',
): Promise<FanoutResult> {
  const recipients = await listRecipientsWithInvitees(db, event.id, actor.id);
  return fanoutToRecipients(
    db,
    recipients,
    {
      type: 'event.changed',
      eventId: event.id,
      actorId: actor.id,
      actorName: actor.name,
      title: `${event.title} — ${diff.summary.toLowerCase()}`,
      body: actor.name ? `Edited by ${actor.name}` : null,
      url: `/events/${event.id}`,
      payload: { changedFields: diff.changedFields },
    },
    {
      title: `${event.title} — updated`,
      body: diff.summary,
      url: `${baseUrl}/events/${event.id}`,
      tag: `event-${event.id}-changed`,
    },
  );
}

/** A4 — host cancelled (deleted) the event. Notify RSVP=yes/interested users + invitees. */
export async function fanoutEventCancelled(
  db: Db,
  event: EventLite & { creatorId?: string },
  actor: Actor,
  baseUrl = 'https://calendar.castalia.one',
): Promise<FanoutResult> {
  const recipients = await listRecipientsWithInvitees(db, event.id, actor.id);
  // event_id deliberately null — cascade delete on the events row would
  // otherwise wipe the notification immediately. Cancellation is the one
  // type where the inbox row needs to outlive its event. Source-of-truth
  // event identity lives in payload.cancelledEventId.
  return fanoutToRecipients(
    db,
    recipients,
    {
      type: 'event.cancelled',
      eventId: null,
      actorId: actor.id,
      actorName: actor.name,
      title: `${event.title} — cancelled`,
      body: actor.name ? `Cancelled by ${actor.name}` : 'This event has been cancelled.',
      url: '/',
      payload: { cancelledEventId: event.id, cancelledEventTitle: event.title },
    },
    {
      title: `${event.title} — cancelled`,
      body: 'This event has been cancelled.',
      url: `${baseUrl}/`,
      tag: `event-${event.id}-cancelled`,
    },
  );
}

/**
 * C2 — attendance report says didn't happen or host wasn't there.
 * Notifies the event creator. Different from A3/A4 in that the recipient
 * is a single user (the host), not a fan-out.
 */
export async function fanoutAttendanceNegative(
  db: Db,
  event: Event,
  report: { eventHappened: boolean; hostPresent: boolean },
  reporter: Actor,
  baseUrl = 'https://calendar.castalia.one',
): Promise<FanoutResult> {
  // Only fire when there's something negative to report.
  if (report.eventHappened && report.hostPresent) return ZERO;
  // Don't notify the host that they themselves filed a negative report.
  if (reporter.id && reporter.id === event.creatorId) return ZERO;

  const negatives: string[] = [];
  if (!report.eventHappened) negatives.push("didn't happen");
  if (!report.hostPresent) negatives.push("you weren't there");
  const summary = negatives.join(' / ');

  return fanoutToRecipients(
    db,
    [event.creatorId],
    {
      type: 'attendance.negative',
      eventId: event.id,
      actorId: reporter.id,
      actorName: reporter.name,
      title: `${event.title} — attendance report`,
      body: reporter.name ? `${reporter.name}: ${summary}` : summary,
      url: `/events/${event.id}#attendance-report`,
      payload: {
        eventHappened: report.eventHappened,
        hostPresent: report.hostPresent,
      },
    },
    {
      title: `${event.title} — attendance feedback`,
      body: summary,
      url: `${baseUrl}/events/${event.id}#attendance-report`,
      tag: `attendance-negative-${event.id}-${reporter.id ?? 'anon'}`,
    },
  );
}

export interface InvitedUser {
  userId: string;
  name?: string | null;
}

/**
 * A5 — new event created with invitees. Fire one `invitation.received`
 * notification per invitee. Actor = organizer (creatorId).
 * Best-effort: partial failures are logged but don't throw.
 */
export async function fanoutInvitationReceived(
  db: Db,
  event: EventLite & { id: number },
  invitees: InvitedUser[],
  actor: Actor,
  baseUrl = 'https://calendar.castalia.one',
): Promise<FanoutResult> {
  if (invitees.length === 0) return ZERO;

  // Exclude actor from self-notification (organizer inviting themselves).
  const recipients = actor.id
    ? invitees.filter((inv) => inv.userId !== actor.id)
    : invitees;

  if (recipients.length === 0) return ZERO;

  const inboxRow = {
    type: 'invitation.received',
    eventId: event.id,
    actorId: actor.id,
    actorName: actor.name,
    title: `You're invited: ${event.title}`,
    body: actor.name ? `Invited by ${actor.name}` : null,
    url: `/events/${event.id}`,
    payload: {
      eventTitle: event.title,
      eventStartsAt: event.startsAt instanceof Date ? event.startsAt.toISOString() : event.startsAt,
      organizerName: actor.name,
    } as Record<string, unknown>,
  };

  const pushPayload = {
    title: `You're invited: ${event.title}`,
    body: actor.name ? `Invited by ${actor.name}` : 'You have a new invitation',
    url: `${baseUrl}/events/${event.id}`,
    tag: `invitation-${event.id}`,
  };

  return fanoutToRecipients(
    db,
    recipients.map((inv) => inv.userId),
    inboxRow,
    pushPayload,
  );
}

// inArray is exported here so callers (e.g., admin batch ops in the future)
// can compose without re-importing from drizzle-orm. Currently unused.
export { inArray };
