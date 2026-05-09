import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireAdmin() {
  const user = await getAuthedUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  try {
    const allMembers = await db.select().from(members);
    return NextResponse.json(allMembers);
  } catch (err) {
    console.error('[GET /api/admin/members]', err);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { hyloId, clerkId, role } = body as Record<string, unknown>;

  // Caller must identify the target by exactly one of hyloId or clerkId.
  // Clerk-only members have null hyloId, so the original hyloId-only
  // contract excluded them from role updates.
  const hasHyloId = typeof hyloId === 'string' && hyloId.length > 0;
  const hasClerkId = typeof clerkId === 'string' && clerkId.length > 0;
  if (!hasHyloId && !hasClerkId) {
    return NextResponse.json(
      { error: 'hyloId or clerkId is required' },
      { status: 400 },
    );
  }
  if (!role || !['member', 'host', 'admin'].includes(role as string)) {
    return NextResponse.json({ error: 'role must be member, host, or admin' }, { status: 400 });
  }

  try {
    const predicate = hasHyloId
      ? eq(members.hyloId, hyloId as string)
      : eq(members.clerkId, clerkId as string);

    const [updated] = await db
      .update(members)
      .set({ role: role as string, updatedAt: new Date() })
      .where(predicate)
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
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { hyloId, clerkId, name, image, role } = body as Record<string, unknown>;

  // Mirror the PATCH contract: caller identifies the new row by exactly
  // one of hyloId or clerkId. Both nullable in schema but the
  // chk_members_identity CHECK requires at least one non-null per row.
  const hasHyloId = typeof hyloId === 'string' && hyloId.length > 0;
  const hasClerkId = typeof clerkId === 'string' && clerkId.length > 0;
  if (!hasHyloId && !hasClerkId) {
    return NextResponse.json(
      { error: 'hyloId or clerkId is required' },
      { status: 400 },
    );
  }
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const assignRole = (typeof role === 'string' && ['member', 'host', 'admin'].includes(role))
    ? role
    : 'host';
  const imageValue = typeof image === 'string' ? image : null;

  try {
    const baseValues = {
      name,
      image: imageValue,
      role: assignRole,
      ...(hasHyloId ? { hyloId: hyloId as string } : {}),
      ...(hasClerkId ? { clerkId: clerkId as string } : {}),
    };
    const conflictSet = {
      name,
      image: imageValue,
      role: assignRole,
      updatedAt: new Date(),
    };
    const conflictTarget = hasHyloId ? members.hyloId : members.clerkId;

    const [created] = await db
      .insert(members)
      .values(baseValues)
      .onConflictDoUpdate({ target: conflictTarget, set: conflictSet })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[POST /api/admin/members]', err);
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
  }
}
