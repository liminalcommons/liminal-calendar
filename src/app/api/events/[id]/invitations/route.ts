import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { visibleEventsForUserCondition } from '@/lib/events/visibility';
import { listEventInvitations } from '@/lib/events/invitations-repo';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await getAuthedUser();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  const userId = authed.id;

  try {
    const visibilityCond = visibleEventsForUserCondition(userId);

    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, numId), visibilityCond));

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const invitations = await listEventInvitations(numId);
    return NextResponse.json({ invitations });
  } catch (err) {
    console.error('[GET /api/events/[id]/invitations]', err);
    return NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 });
  }
}
