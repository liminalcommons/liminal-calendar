import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getUserRole, canCreateEvents } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
import { createEvent as createHyloEvent } from '@/lib/hylo-client';
import { asc, eq } from 'drizzle-orm';

export async function GET() {
  try {
    const allEvents = await db.select().from(events).orderBy(asc(events.startsAt));

    // Fetch all RSVPs in one query
    const allRsvps = allEvents.length > 0
      ? await db.select().from(rsvps)
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
    const currentUserId = (session?.user as any)?.hyloId as string | undefined;

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

  const { title, startTime, endTime, details, timezone, location, imageUrl, recurrenceRule, hyloGroupId, hyloGroupIds } =
    body as Record<string, unknown>;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!startTime || typeof startTime !== 'string') {
    return NextResponse.json({ error: 'startTime is required' }, { status: 400 });
  }
  if (!endTime || typeof endTime !== 'string') {
    return NextResponse.json({ error: 'endTime is required' }, { status: 400 });
  }

  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  if (isNaN(startDate.getTime())) {
    return NextResponse.json({ error: 'startTime is not a valid date' }, { status: 400 });
  }
  if (isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'endTime is not a valid date' }, { status: 400 });
  }

  const user = session.user as any;

  const groupId = typeof hyloGroupId === 'string' && hyloGroupId ? hyloGroupId : null;

  try {
    const [created] = await db
      .insert(events)
      .values({
        title: (title as string).trim(),
        description: typeof details === 'string' ? details : null,
        startsAt: startDate,
        endsAt: endDate,
        timezone: typeof timezone === 'string' ? timezone : 'UTC',
        location: typeof location === 'string' ? location : null,
        imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
        recurrenceRule: typeof recurrenceRule === 'string' ? recurrenceRule : null,
        hyloGroupId: groupId,
        creatorId: user.hyloId ?? user.id ?? 'unknown',
        creatorName: user.name ?? 'Unknown',
        creatorImage: user.image ?? null,
      })
      .returning();

    // Sync to Hylo — supports multiple groups
    const accessToken = (session as any).accessToken as string | undefined;
    const groupIds: string[] = Array.isArray(hyloGroupIds)
      ? hyloGroupIds.filter((id: unknown) => typeof id === 'string' && id)
      : groupId ? [groupId] : [];

    if (groupIds.length > 0 && !accessToken) {
      console.warn('[POST /api/events] Hylo groups selected but no accessToken in session — cannot sync to Hylo. Session keys:', Object.keys(session || {}), 'User keys:', Object.keys((session as any)?.user || {}));
    }
    if (groupIds.length > 0) {
      console.warn('[POST /api/events] Hylo debug: groupIds=', groupIds, 'hasAccessToken=', !!accessToken, 'sessionType=', typeof session);
    }
    if (groupIds.length > 0 && accessToken) {
      const calendarLink = `https://calendar.castalia.one/events/${created.id}`;
      const hyloDetails = [
        typeof details === 'string' ? details : '',
        `\n\n---\n📅 [View on Liminal Calendar](${calendarLink})`,
      ].join('').trim();

      for (const gid of groupIds) {
        try {
          const hyloEvent = await createHyloEvent(accessToken, gid, {
            title: (title as string).trim(),
            details: hyloDetails,
            startTime: startDate,
            endTime: endDate,
            timezone: typeof timezone === 'string' ? timezone : undefined,
            location: typeof location === 'string' ? location : undefined,
            imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
          });

          // Store the first Hylo post ID
          if (!created.hyloPostId) {
            await db
              .update(events)
              .set({ hyloPostId: hyloEvent.id })
              .where(eq(events.id, created.id));
            created.hyloPostId = hyloEvent.id;
          }
        } catch (hyloErr) {
          console.warn(`[POST /api/events] Hylo sync to group ${gid} failed:`, hyloErr);
        }
      }
    }

    return NextResponse.json(dbEventToDisplayEvent(created), { status: 201 });
  } catch (err) {
    console.error('[POST /api/events]', err);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
