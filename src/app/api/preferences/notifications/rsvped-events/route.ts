import { NextResponse } from 'next/server';
import { auth } from '@/../auth';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { and, asc, eq, gte, inArray, not } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userIdFromSession(session: any): string {
  return session.user.hyloId || session.user.id;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userIdFromSession(session);
  const url = new URL(_request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 50);

  const rsvpedIds = await db
    .select({ eventId: rsvps.eventId })
    .from(rsvps)
    .where(and(eq(rsvps.userId, userId), not(eq(rsvps.status, 'no'))));
  const ids = rsvpedIds.map((r) => r.eventId);
  if (ids.length === 0) return NextResponse.json({ events: [] });

  const upcoming = await db
    .select({ id: events.id, title: events.title, starts_at: events.startsAt })
    .from(events)
    .where(and(inArray(events.id, ids), gte(events.startsAt, new Date())))
    .orderBy(asc(events.startsAt))
    .limit(limit);

  return NextResponse.json({ events: upcoming });
}
