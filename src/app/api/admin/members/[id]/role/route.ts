import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { canPromoteMembers } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const ALLOWED = new Set(['member', 'host', 'admin']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getAuthedUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canPromoteMembers(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.role || !ALLOWED.has(body.role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const { id } = await params;
  const memberId = parseInt(id, 10);
  if (!Number.isFinite(memberId)) {
    return NextResponse.json({ error: 'Invalid member id' }, { status: 400 });
  }

  const [updated] = await db
    .update(members)
    .set({ role: body.role, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  console.warn('[admin/role] caller=%s target=%d role=%s', caller.id, memberId, body.role);
  revalidatePath('/admin');
  return NextResponse.json({ id: updated.id, role: updated.role });
}
