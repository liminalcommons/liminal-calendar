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

export async function POST(request: NextRequest) {
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

  const { hyloId, name, image, role } = body as Record<string, unknown>;

  if (!hyloId || typeof hyloId !== 'string') {
    return NextResponse.json({ error: 'hyloId is required' }, { status: 400 });
  }
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const assignRole = (typeof role === 'string' && ['member', 'host', 'admin'].includes(role))
    ? role
    : 'member';

  try {
    const [created] = await db
      .insert(members)
      .values({
        hyloId,
        name,
        image: typeof image === 'string' ? image : null,
        role: assignRole,
      })
      .onConflictDoUpdate({
        target: members.hyloId,
        set: {
          name,
          image: typeof image === 'string' ? image : null,
          role: assignRole,
          updatedAt: new Date(),
        },
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[POST /api/admin/members]', err);
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
  }
}
