import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getUserRole, canCreateEvents } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
import { asc, inArray, gte, lte, and } from 'drizzle-orm';
import { validateCreateEventInput } from '@/lib/events/create-event-input';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

    const conditions = [];
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) conditions.push(gte(events.startsAt, fromDate));
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) conditions.push(lte(events.startsAt, toDate));
    }

    const query = db.select().from(events).orderBy(asc(events.startsAt)).limit(limit).offset(offset);
    const allEvents = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    // Fetch RSVPs only for the returned events
    const eventIds = allEvents.map((e) => e.id);
    const allRsvps = eventIds.length > 0
      ? await db.select().from(rsvps).where(inArray(rsvps.eventId, eventIds))
      : [];

    // Group RSVPs by event ID
    const rsvpsByEvent = new Map<number, typeof allRsvps>();
    for (const rsvp of allRsvps) {
      const list = rsvpsByEvent.get(rsvp.eventId) ?? [];
      list.push(rsvp);
      rsvpsByEvent.set(rsvp.eventId, list);
    }

    // Get current user for myResponse
    const session = await auth();
    const currentUserId = session?.user?.hyloId as string | undefined;

    const displayEvents = allEvents.map((event) =>
      dbEventToDisplayEvent(event, rsvpsByEvent.get(event.id) ?? [], currentUserId),
    );

    return NextResponse.json(displayEvents);
  } catch (err) {
    console.error('[GET /api/events]', err);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = getUserRole(session);
  if (!canCreateEvents(role)) {
    return NextResponse.json(
      { error: 'Forbidden: only hosts and admins can create events' },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = validateCreateEventInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error.error }, { status: validation.error.status });
  }
  const v = validation.value;

  const user = session.user;

  try {
    const [created] = await db
      .insert(events)
      .values({
        title: v.title,
        description: v.description,
        startsAt: v.startDate,
        endsAt: v.endDate,
        timezone: v.timezone,
        location: v.location,
        imageUrl: v.imageUrl,
        recurrenceRule: v.recurrenceRule,
        hyloGroupId: v.hyloGroupId,
        creatorId: user.hyloId ?? user.id ?? 'unknown',
        creatorName: user.name ?? 'Unknown',
        creatorImage: user.image ?? null,
      })
      .returning();

    return NextResponse.json(dbEventToDisplayEvent(created), { status: 201 });
  } catch (err) {
    console.error('[POST /api/events]', err);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
