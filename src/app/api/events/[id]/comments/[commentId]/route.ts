import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { getComment, softDeleteComment } from '@/lib/comments/repo';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, commentId } = await params;
  const numEventId = parseInt(id, 10);
  const numCommentId = parseInt(commentId, 10);
  if (Number.isNaN(numEventId) || Number.isNaN(numCommentId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const comment = await getComment(db, numCommentId);
  // Treat already-deleted as not-found so callers can't probe authorship
  // of soft-deleted rows.
  if (
    !comment ||
    comment.eventId !== numEventId ||
    comment.deletedAt !== null
  ) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  const callerId = member.logtoId ?? member.clerkId ?? null;
  const isAuthor = callerId !== null && comment.authorId === callerId;
  const isAdmin = member.role === 'admin';
  if (!isAuthor && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await softDeleteComment(db, numCommentId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/events/[id]/comments/[commentId]]', err);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 },
    );
  }
}
