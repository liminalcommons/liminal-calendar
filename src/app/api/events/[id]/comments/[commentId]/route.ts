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

  // Authorize on the canonical member.id FK, not the legacy provider-string
  // authorId (logtoId/clerkId/'unknown'). The provider string is mutable,
  // can be null for legacy rows, and collides on 'unknown' — keying authorship
  // on it locks real authors out (e.g. a member whose only id is a legacy
  // value that no longer matches logtoId/clerkId) and is brittle across the
  // Hylo→Logto→Clerk identity migrations. event_comments.memberId is set on
  // every create (see comments POST → createComment), so it's the reliable key.
  const isAuthor = comment.memberId != null && comment.memberId === member.id;
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
