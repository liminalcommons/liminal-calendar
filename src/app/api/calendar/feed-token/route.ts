import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

// GET — return the authenticated user's feed token (create if missing)
export async function GET() {
  const session = await getServerSession();
  const hyloId = (session?.user as any)?.hyloId as string | undefined;
  if (!hyloId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if member already has a feed token
  const [member] = await db
    .select({ feedToken: members.feedToken })
    .from(members)
    .where(eq(members.hyloId, hyloId))
    .limit(1);

  if (member?.feedToken) {
    return NextResponse.json({ feedToken: member.feedToken });
  }

  // Generate and save a new token
  const feedToken = `feed_${randomBytes(12).toString('hex')}`;
  await db
    .update(members)
    .set({ feedToken, updatedAt: new Date() })
    .where(and(eq(members.hyloId, hyloId), isNull(members.feedToken)));

  return NextResponse.json({ feedToken });
}

// POST — regenerate the user's feed token (revokes old URL)
export async function POST() {
  const session = await getServerSession();
  const hyloId = (session?.user as any)?.hyloId as string | undefined;
  if (!hyloId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const feedToken = `feed_${randomBytes(12).toString('hex')}`;
  const [updated] = await db
    .update(members)
    .set({ feedToken, updatedAt: new Date() })
    .where(eq(members.hyloId, hyloId))
    .returning({ feedToken: members.feedToken });

  if (!updated) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  return NextResponse.json({ feedToken: updated.feedToken });
}
