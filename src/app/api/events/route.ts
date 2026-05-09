import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { canCreateEvents, canCreatePublicEvent } from '@/lib/auth-helpers';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
import { asc, inArray, gte, lte, and } from 'drizzle-orm';
import { validateCreateEventInput } from '@/lib/events/create-event-input';
import { visibleEventsForMemberCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';
import { validateInviteeCap, setEventInvitations, type Invitee } from '@/lib/events/invitations-repo';
import { fanoutInvitationReceived } from '@/lib/notifications/fanout';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

    // Resolve identity once — used for both visibility filtering and myResponse.
    // getAuthedUser handles Hylo + Clerk; for Clerk-only users it reads role
    // and identifiers from the members row.
    const authed = await getAuthedUser();
    const currentUserId = authed?.id;

    const conditions = [];
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) conditions.push(gte(events.startsAt, fromDate));
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) conditions.push(lte(events.startsAt, toDate));
    }

    // Visibility: authenticated users see public + their own/invited/rsvp'd events;
    // unauthenticated users see public events only.
    const visibilityCond = authed?.memberId
      ? visibleEventsForMemberCondition(authed.memberId)
      : publicOnlyEventsCondition();
    conditions.push(visibilityCond);

    const query = db.select().from(events).orderBy(asc(events.startsAt)).limit(limit).offset(offset);
    const allEvents = await query.where(and(...conditions));

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
  const authed = await getAuthedUser();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = authed.role;
  const user = {
    hyloId: authed.hyloId,
    clerkId: authed.clerkId,
    id: authed.id,
    name: authed.name,
    image: authed.image,
  };

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

  // Tier check: only hosts and admins may publish public events.
  if (v.visibility === 'public' && !canCreatePublicEvent(role)) {
    return NextResponse.json(
      { error: 'Forbidden: only hosts and admins can create public events' },
      { status: 403 },
    );
  }

  // Extract optional invitees from body (not part of validateCreateEventInput)
  const rawInvitees = (body as Record<string, unknown>).invitees;
  const invitees: Invitee[] = Array.isArray(rawInvitees) ? (rawInvitees as Invitee[]) : [];

  // Approach (b): validate cap BEFORE inserting the event row.
  // This avoids orphan rows when the cap is exceeded.
  let dedupedInvitees: Invitee[] = [];
  if (invitees.length > 0) {
    try {
      dedupedInvitees = validateInviteeCap({ organizerRole: role, invitees });
    } catch (err) {
      if (err instanceof Error && err.message === 'INVITEE_CAP_EXCEEDED') {
        return NextResponse.json(
          { error: `Invitee cap exceeded: members may invite at most 10 people` },
          { status: 400 },
        );
      }
      throw err;
    }
  }

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
        visibility: v.visibility,
        creatorId: user.hyloId ?? user.clerkId ?? user.id ?? 'unknown',
        memberId: authed.memberId,
        creatorName: user.name ?? 'Unknown',
        creatorImage: user.image ?? null,
      })
      .returning();

    // Wire in invitations if provided (deduped list, cap already validated).
    if (dedupedInvitees.length > 0) {
      await setEventInvitations({
        eventId: created.id,
        organizerRole: role,
        invitees: dedupedInvitees,
      });

      // A5 fan-out: one invitation.received notification per invitee.
      // Best-effort; never fails the POST response.
      try {
        const actorId = (user as Record<string, unknown>).hyloId as string ?? user.id ?? null;
        const actorName = (user.name as string | undefined) ?? null;
        await fanoutInvitationReceived(
          db,
          created,
          dedupedInvitees.map((inv) => ({ userId: inv.userId, name: inv.name })),
          { id: actorId, name: actorName },
        );
      } catch (fanoutErr) {
        console.error('[POST /api/events] invitation fanout failed', fanoutErr);
      }
    }

    // Invalidate Full Route Cache for views that list events so the freshly
    // created event appears on subsequent navigation without manual refresh.
    revalidatePath('/');
    revalidatePath('/list');
    revalidatePath('/month');

    return NextResponse.json(dbEventToDisplayEvent(created), { status: 201 });
  } catch (err) {
    console.error('[POST /api/events]', err);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
