import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { upsertRsvp } from '@/lib/rsvp/upsert';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { addNewsletterSubscriber } from '@/lib/newsletter/add-subscriber';

const VALID_RESPONSES = ['yes', 'interested', 'no'] as const;
type ValidResponse = (typeof VALID_RESPONSES)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const member = await getCurrentMember(db);
  if (!member) {
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

  const { response, remindMe, subscribeToNewsletter } = body as Record<string, unknown>;
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

  // userId: hyloId for Hylo Members, clerkId for Clerk-only Members.
  // Slight semantic ambiguity (the column name is "user_id" but carries
  // either provider's id); avoids a schema migration. Will be cleaned up
  // when rsvps gains a member_id FK in a future cycle.
  const userId = member.hyloId ?? member.clerkId ?? 'unknown';

  try {
    const remindMeValue = typeof remindMe === 'boolean' ? remindMe : undefined;

    await upsertRsvp(db, {
      eventId: numId,
      userId,
      userName: member.name,
      userImage: member.image,
      status: response as string,
      remindMe: remindMeValue,
    });

    // Newsletter opt-in: fire-and-forget so a newsletter failure can't
    // block the RSVP write. Idempotent on the unique email constraint
    // (re-RSVPs with opt-in repeatedly are no-ops).
    if (subscribeToNewsletter === true && member.email) {
      addNewsletterSubscriber(db, {
        email: member.email,
        source: 'rsvp',
      }).catch((err) => {
        console.error('[POST /api/events/[id]/rsvp] newsletter subscribe failed:', err);
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
        remindMe: r.remindMe ?? false,
      })),
    };

    return NextResponse.json({ creator, invitations });
  } catch (err) {
    console.error('[GET /api/events/[id]/rsvp]', err);
    return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 });
  }
}
