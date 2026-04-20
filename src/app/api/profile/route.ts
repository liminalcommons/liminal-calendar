import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { validateProfileUpdate } from '@/lib/profile/update-input';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const hyloId = session.user.hyloId as string | undefined;
  if (!hyloId) {
    return NextResponse.json({ error: 'No Hylo ID' }, { status: 400 });
  }

  try {
    const [member] = await db.select().from(members).where(eq(members.hyloId, hyloId)).limit(1);
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    return NextResponse.json({
      hyloId: member.hyloId,
      name: member.name,
      email: member.email,
      image: member.image,
      timezone: member.timezone ?? 'UTC',
      availability: JSON.parse(member.availability ?? '[]'),
    });
  } catch (err) {
    console.error('[GET /api/profile]', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const hyloId = session.user.hyloId as string | undefined;
  if (!hyloId) {
    return NextResponse.json({ error: 'No Hylo ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validation = validateProfileUpdate(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const updates = validation.updates;

  try {
    const [updated] = await db
      .update(members)
      .set(updates)
      .where(eq(members.hyloId, hyloId))
      .returning();

    return NextResponse.json({
      hyloId: updated.hyloId,
      name: updated.name,
      timezone: updated.timezone,
      availability: JSON.parse(updated.availability ?? '[]'),
    });
  } catch (err) {
    console.error('[PATCH /api/profile]', err);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
