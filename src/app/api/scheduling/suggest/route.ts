import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getUserRole, canCreateEvents } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { findBestTimes } from '@/lib/scheduling';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canCreateEvents(getUserRole(session))) {
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
    const invitees = await db.select({
      hyloId: members.hyloId,
      name: members.name,
      availability: members.availability,
    }).from(members).where(inArray(members.hyloId, inviteeIds as string[]));

    const membersAvail = invitees.map(m => ({
      hyloId: m.hyloId,
      name: m.name,
      availability: JSON.parse(m.availability ?? '[]') as number[],
    }));

    const suggestions = findBestTimes(membersAvail, duration);
    return NextResponse.json(suggestions);
  } catch (err) {
    console.error('[POST /api/scheduling/suggest]', err);
    return NextResponse.json({ error: 'Failed to compute suggestions' }, { status: 500 });
  }
}
