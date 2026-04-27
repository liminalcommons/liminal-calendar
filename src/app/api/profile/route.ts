import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { validateProfileUpdate } from '@/lib/profile/update-input';
import { getCurrentMember } from '@/lib/auth/get-current-member';

export async function GET() {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    // Update by primary key — works for both Hylo and Clerk Members
    // (the previous WHERE hyloId = X pattern only worked for Hylo users).
    const [updated] = await db
      .update(members)
      .set(updates)
      .where(eq(members.id, member.id))
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
