import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getCurrentMember } from '@/lib/auth/get-current-member';

export const dynamic = 'force-dynamic';

// GET — return the authenticated user's feed token (create if missing)
export async function GET() {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (member.feedToken) {
    return NextResponse.json({ feedToken: member.feedToken });
  }

  const feedToken = `feed_${randomBytes(12).toString('hex')}`;
  await db
    .update(members)
    .set({ feedToken, updatedAt: new Date() })
    .where(and(eq(members.id, member.id), isNull(members.feedToken)));

  return NextResponse.json({ feedToken });
}

// POST — regenerate the user's feed token (revokes old URL)
export async function POST() {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const feedToken = `feed_${randomBytes(12).toString('hex')}`;
  const [updated] = await db
    .update(members)
    .set({ feedToken, updatedAt: new Date() })
    .where(eq(members.id, member.id))
    .returning({ feedToken: members.feedToken });

  if (!updated) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  return NextResponse.json({ feedToken: updated.feedToken });
}
