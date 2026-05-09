import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, members, rsvps } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
import { generateCalendarFeed, type ICSEvent } from '@/lib/ics-generator';
import { visibleEventsForMemberCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';
import { and, asc, eq, inArray, not } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// Strip HTML tags from description for plain-text ICS
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    // Look up user by feed token (if provided). The token resolves to the
    // canonical members.id (Phase 3 — visibility predicate is integer-keyed)
    // and to the legacy provider-string id (still used by rsvps.user_id
    // until Phase 4 drops the column).
    let _userId: string | null = null;
    let _memberId: number | null = null;
    if (token) {
      const [member] = await db
        .select({ id: members.id, hyloId: members.hyloId, clerkId: members.clerkId })
        .from(members)
        .where(eq(members.feedToken, token))
        .limit(1);
      if (member) {
        _memberId = member.id;
        _userId = member.hyloId ?? member.clerkId;
      }
      // Invalid token: fall through to universal feed (backward compatible)
    }

    const filter = request.nextUrl.searchParams.get('filter');

    // Visibility: token-authenticated users see public + their own/invited/rsvp'd events;
    // unauthenticated callers (no token or invalid token) see public events only.
    const visibilityCond = _memberId
      ? visibleEventsForMemberCondition(_memberId)
      : publicOnlyEventsCondition();

    let allEvents;
    if (filter === 'rsvps-only' && _userId) {
      // Subquery: event ids the user has RSVPed yes/interested to
      const rsvpedEventIds = await db
        .select({ eventId: rsvps.eventId })
        .from(rsvps)
        .where(and(eq(rsvps.userId, _userId), not(eq(rsvps.status, 'no'))));
      const ids = rsvpedEventIds.map((r) => r.eventId);
      allEvents = ids.length === 0
        ? []
        : await db.select().from(events).where(and(inArray(events.id, ids), visibilityCond)).orderBy(asc(events.startsAt));
    } else {
      allEvents = await db.select().from(events).where(visibilityCond).orderBy(asc(events.startsAt));
    }
    const displayEvents = allEvents.map((e) => dbEventToDisplayEvent(e));

    const icsEvents: (ICSEvent & { id: string })[] = displayEvents.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description ? stripHtml(e.description) : undefined,
      starts_at: e.starts_at,
      ends_at: e.ends_at ?? undefined,
      location: e.location ?? undefined,
      url: e.event_url ?? undefined,
      organizer: { name: e.creator_name },
      recurrenceRule: e.recurrenceRule,
    }));

    const icsContent = generateCalendarFeed(icsEvents);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="liminal-commons.ics"',
        'Cache-Control': 'public, max-age=900, s-maxage=900',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('ICS feed error:', err);
    return new NextResponse('Calendar feed temporarily unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain', 'Retry-After': '300' },
    });
  }
}
