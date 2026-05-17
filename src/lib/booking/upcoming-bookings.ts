/**
 * Server-side query: 1:1 bookings the given member is involved in
 * (either as host or as a yes-rsvp'd attendee), within the next
 * `horizonDays` days, excluding cancelled events.
 *
 * Returned shape carries everything /book needs to render the
 * "Your upcoming 1:1s" list with a cancel button — no follow-up
 * fetches required.
 */

import { and, eq, gte, isNull, or, sql, asc } from 'drizzle-orm';
import { events, members, rsvps } from '@/lib/db/schema';

export interface UpcomingBooking {
  id: number;
  title: string;
  startsAt: string; // ISO
  endsAt: string | null;
  location: string | null;
  timezone: string;
  viewerIsHost: boolean;
  otherPartyName: string;
}

interface DbHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: (...args: any[]) => any;
}

export async function listUpcomingBookingsForMember(
  db: DbHandle,
  memberId: number,
  horizonDays = 60,
): Promise<UpcomingBooking[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);

  // Step 1: candidate events — booking-created, future, not cancelled,
  // and the caller is either the host (events.member_id) or has any
  // rsvp on the event (rsvps.member_id). We left-join rsvps to detect
  // booker membership.
  const hostsubq = db
    .select({ eventId: rsvps.eventId })
    .from(rsvps)
    .where(eq(rsvps.memberId, memberId));

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      location: events.location,
      timezone: events.timezone,
      hostMemberId: events.memberId,
      creatorName: events.creatorName,
    })
    .from(events)
    .where(
      and(
        sql`${events.sourceEventTypeId} IS NOT NULL`,
        gte(events.startsAt, now),
        sql`${events.startsAt} <= ${horizon}`,
        isNull(events.cancelledAt),
        or(
          eq(events.memberId, memberId),
          sql`${events.id} IN (${hostsubq})`,
        ),
      ),
    )
    .orderBy(asc(events.startsAt));

  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Step 2: collect every "other party" name in one query. For events
  // the viewer is the host of, the other party is the booker (rsvp
  // with memberId != hostMemberId). For events the viewer is booking,
  // the other party is the host (events.creatorName captures this).
  const eventIds = rows.map((r) => r.id);
  const allRsvpsRaw = await db
    .select({
      eventId: rsvps.eventId,
      memberId: rsvps.memberId,
      userName: rsvps.userName,
    })
    .from(rsvps)
    .where(sql`${rsvps.eventId} IN (${sql.join(eventIds.map((id) => sql`${id}`), sql`, `)})`);
  const allRsvps = allRsvpsRaw as Array<{ eventId: number; memberId: number | null; userName: string }>;

  const out: UpcomingBooking[] = rows.map((r) => {
    const viewerIsHost = r.hostMemberId === memberId;
    let otherPartyName: string;
    if (viewerIsHost) {
      // Find a non-host rsvp for this event.
      const bookerRsvp = allRsvps.find(
        (s) => s.eventId === r.id && s.memberId !== memberId,
      );
      otherPartyName = bookerRsvp?.userName ?? 'Someone';
    } else {
      otherPartyName = r.creatorName ?? 'Host';
    }
    return {
      id: r.id,
      title: r.title,
      startsAt: (r.startsAt instanceof Date ? r.startsAt : new Date(r.startsAt)).toISOString(),
      endsAt: r.endsAt ? (r.endsAt instanceof Date ? r.endsAt : new Date(r.endsAt)).toISOString() : null,
      location: r.location ?? null,
      timezone: r.timezone ?? 'UTC',
      viewerIsHost,
      otherPartyName,
    };
  });

  // members import is unused at the value level but kept for downstream
  // joins if we ever swap rsvp-name lookups for canonical member.name.
  void members;
  return out;
}
