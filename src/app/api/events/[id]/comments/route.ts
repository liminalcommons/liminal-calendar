import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import {
  createComment,
  listComments,
  COMMENT_MAX_LENGTH,
} from '@/lib/comments/repo';
import { auth } from '../../../../../../auth';
import { visibleEventsForUserCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';

async function eventExists(numId: number): Promise<boolean> {
  const session = await auth();
  const userAny = session?.user as ({ hyloId?: string; clerkId?: string }) | undefined;
  const userId = (userAny?.hyloId ?? userAny?.clerkId) as string | undefined;
  const visibilityCond = userId ? visibleEventsForUserCondition(userId) : publicOnlyEventsCondition();
  const rows = await db.select().from(events).where(and(eq(events.id, numId), visibilityCond));
  return rows.length > 0;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }
  if (!(await eventExists(numId))) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  try {
    const comments = await listComments(db, numId);
    return NextResponse.json({ comments });
  } catch (err) {
    console.error('[GET /api/events/[id]/comments]', err);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { body: text } = body as { body?: unknown };
  if (typeof text !== 'string') {
    return NextResponse.json({ error: 'body must be a string' }, { status: 400 });
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ error: 'body must not be empty' }, { status: 400 });
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    return NextResponse.json(
      { error: `body must be ${COMMENT_MAX_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  if (!(await eventExists(numId))) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const authorId = member.hyloId ?? member.clerkId ?? 'unknown';

  try {
    const comment = await createComment(db, {
      eventId: numId,
      authorId,
      authorName: member.name,
      authorImage: member.image,
      body: trimmed,
    });
    return NextResponse.json({ comment });
  } catch (err) {
    console.error('[POST /api/events/[id]/comments]', err);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
