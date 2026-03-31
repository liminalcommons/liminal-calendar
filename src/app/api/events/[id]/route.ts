import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getUserRole, canEditEvent, canDeleteEvent } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  try {
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, numId));

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventRsvps = await db
      .select()
      .from(rsvps)
      .where(eq(rsvps.eventId, numId));

    const session = await auth();
    const currentUserId = (session?.user as any)?.hyloId as string | undefined;

    return NextResponse.json(dbEventToDisplayEvent(event, eventRsvps, currentUserId));
  } catch (err) {
    console.error('[GET /api/events/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  const role = getUserRole(session);

  // Fetch event to check ownership
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, numId));

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const isCreator = event.creatorId === (session.user as any)?.hyloId;
  if (!canEditEvent(role, isCreator)) {
    return NextResponse.json(
      { error: 'Forbidden: insufficient permissions to edit this event' },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates = body as Record<string, unknown>;
  const setValues: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof updates.title === 'string') setValues.title = updates.title;
  if (typeof updates.details === 'string') setValues.description = updates.details;
  if (typeof updates.startTime === 'string') setValues.startsAt = new Date(updates.startTime);
  if (typeof updates.endTime === 'string') setValues.endsAt = new Date(updates.endTime);
  if (typeof updates.timezone === 'string') setValues.timezone = updates.timezone;
  if (typeof updates.location === 'string') setValues.location = updates.location;
  if (typeof updates.imageUrl === 'string') setValues.imageUrl = updates.imageUrl;
  if (typeof updates.recurrenceRule === 'string') setValues.recurrenceRule = updates.recurrenceRule;

  try {
    const [updated] = await db
      .update(events)
      .set(setValues)
      .where(eq(events.id, numId))
      .returning();

    const eventRsvps = await db
      .select()
      .from(rsvps)
      .where(eq(rsvps.eventId, numId));

    const currentUserId = (session.user as any)?.hyloId as string | undefined;
    return NextResponse.json(dbEventToDisplayEvent(updated, eventRsvps, currentUserId));
  } catch (err) {
    console.error('[PATCH /api/events/[id]] update', err);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  const role = getUserRole(session);

  // Fetch event to check ownership
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, numId));

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const isCreator = event.creatorId === (session.user as any)?.hyloId;
  if (!canDeleteEvent(role, isCreator)) {
    return NextResponse.json(
      { error: 'Forbidden: insufficient permissions to delete this event' },
      { status: 403 },
    );
  }

  try {
    await db.delete(events).where(eq(events.id, numId));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/events/[id]] delete', err);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
