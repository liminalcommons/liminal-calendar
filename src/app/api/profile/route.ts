import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const hyloId = (session.user as any).hyloId as string | undefined;
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
  const hyloId = (session.user as any).hyloId as string | undefined;
  if (!hyloId) {
    return NextResponse.json({ error: 'No Hylo ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { timezone, availability } = body as Record<string, unknown>;

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof timezone === 'string' && timezone.length > 0) {
    updates.timezone = timezone;
  }

  if (Array.isArray(availability)) {
    const valid = availability.every(s => typeof s === 'number' && s >= 0 && s <= 335);
    if (!valid) {
      return NextResponse.json({ error: 'availability slots must be numbers 0-335' }, { status: 400 });
    }
    updates.availability = JSON.stringify(availability);
  }

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
