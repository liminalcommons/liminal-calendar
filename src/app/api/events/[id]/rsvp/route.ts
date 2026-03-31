import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const VALID_RESPONSES = ['yes', 'interested', 'no'] as const;
type ValidResponse = (typeof VALID_RESPONSES)[number];

export async function POST(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { response } = body as Record<string, unknown>;
  if (!response || !VALID_RESPONSES.includes(response as ValidResponse)) {
    return NextResponse.json(
      { error: `response must be one of: ${VALID_RESPONSES.join(', ')}` },
      { status: 400 },
    );
  }

  // Verify event exists
  const [event] = await db.select().from(events).where(eq(events.id, numId));
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const user = session.user as any;
  const userId = user.hyloId ?? user.id ?? 'unknown';
  const userName = user.name ?? 'Unknown';
  const userImage = user.image ?? null;

  try {
    // Upsert: try to update existing RSVP, insert if not found
    const [existing] = await db
      .select()
      .from(rsvps)
      .where(and(eq(rsvps.eventId, numId), eq(rsvps.userId, userId)));

    if (existing) {
      await db
        .update(rsvps)
        .set({ status: response as string, userName, userImage })
        .where(eq(rsvps.id, existing.id));
    } else {
      await db.insert(rsvps).values({
        eventId: numId,
        userId,
        userName,
        userImage,
        status: response as string,
      });
    }

    return NextResponse.json({ success: true, response });
  } catch (err) {
    console.error('[POST /api/events/[id]/rsvp]', err);
    return NextResponse.json({ error: 'Failed to submit RSVP' }, { status: 500 });
  }
}

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
    // Fetch event for creator info
    const [event] = await db.select().from(events).where(eq(events.id, numId));
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Fetch RSVPs
    const eventRsvps = await db
      .select()
      .from(rsvps)
      .where(eq(rsvps.eventId, numId));

    const creator = {
      id: event.creatorId,
      name: event.creatorName,
      avatarUrl: event.creatorImage,
    };

    const invitations = {
      total: eventRsvps.length,
      items: eventRsvps.map((r) => ({
        id: String(r.id),
        person: {
          id: r.userId,
          name: r.userName,
          avatarUrl: r.userImage,
        },
        response: r.status,
      })),
    };

    return NextResponse.json({ creator, invitations });
  } catch (err) {
    console.error('[GET /api/events/[id]/rsvp]', err);
    return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 });
  }
}
