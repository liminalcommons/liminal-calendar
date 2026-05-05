import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { markAllSeen } from '@/lib/notifications/inbox/repo';

export const dynamic = 'force-dynamic';

export async function POST() {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = member.hyloId ?? member.clerkId ?? 'unknown';
  try {
    const marked = await markAllSeen(db, userId);
    return NextResponse.json({ marked });
  } catch (err) {
    console.error('[POST /api/notifications/seen]', err);
    return NextResponse.json(
      { error: 'Failed to mark notifications as seen' },
      { status: 500 },
    );
  }
}
