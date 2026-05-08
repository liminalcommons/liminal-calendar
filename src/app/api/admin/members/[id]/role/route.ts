import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { getUserRole, canPromoteMembers } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const ALLOWED = new Set(['member', 'host', 'admin']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = getUserRole(session);
  if (!canPromoteMembers(role)) {
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

  const callerId = (session.user as Record<string, unknown>)?.hyloId
    ?? (session.user as Record<string, unknown>)?.clerkId;
  console.info('[admin/role] caller=%s target=%d role=%s', callerId, memberId, body.role);
  return NextResponse.json({ id: updated.id, role: updated.role });
}
