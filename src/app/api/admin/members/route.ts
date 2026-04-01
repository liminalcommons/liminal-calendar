import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getUserRole } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (getUserRole(session) !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const allMembers = await db.select().from(members);
    return NextResponse.json(allMembers);
  } catch (err) {
    console.error('[GET /api/admin/members]', err);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (getUserRole(session) !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { hyloId, role } = body as Record<string, unknown>;

  if (!hyloId || typeof hyloId !== 'string') {
    return NextResponse.json({ error: 'hyloId is required' }, { status: 400 });
  }
  if (!role || !['member', 'host', 'admin'].includes(role as string)) {
    return NextResponse.json({ error: 'role must be member, host, or admin' }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(members)
      .set({ role: role as string, updatedAt: new Date() })
      .where(eq(members.hyloId, hyloId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[PATCH /api/admin/members]', err);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}
