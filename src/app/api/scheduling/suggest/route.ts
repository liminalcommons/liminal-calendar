import { NextRequest, NextResponse } from 'next/server';
import { canCreateEvents } from '@/lib/auth-helpers';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { inArray, or } from 'drizzle-orm';
import { findBestTimes } from '@/lib/scheduling';

export async function POST(request: NextRequest) {
  const authed = await getAuthedUser();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canCreateEvents(authed.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { inviteeIds, durationMinutes } = body as Record<string, unknown>;

  if (!Array.isArray(inviteeIds) || inviteeIds.length === 0) {
    return NextResponse.json({ error: 'inviteeIds required' }, { status: 400 });
  }
  const duration = typeof durationMinutes === 'number' ? durationMinutes : 60;

  try {
    const ids = inviteeIds as string[];
    const invitees = await db.select({
      clerkId: members.clerkId,
      logtoId: members.logtoId,
      name: members.name,
      availability: members.availability,
    }).from(members).where(or(inArray(members.clerkId, ids), inArray(members.logtoId, ids)));

    const membersAvail = invitees
      .map(m => {
        const userId = m.logtoId ?? m.clerkId;
        if (!userId) return null;
        return {
          userId,
          name: m.name,
          availability: JSON.parse(m.availability ?? '[]') as number[],
        };
      })
      .filter((m): m is { userId: string; name: string; availability: number[] } => m !== null);

    const suggestions = findBestTimes(membersAvail, duration);
    return NextResponse.json(suggestions);
  } catch (err) {
    console.error('[POST /api/scheduling/suggest]', err);
    return NextResponse.json({ error: 'Failed to compute suggestions' }, { status: 500 });
  }
}
