import { and, asc, eq, isNull } from 'drizzle-orm';
import { eventComments, type EventComment } from '@/lib/db/schema';
import { resolveMemberId } from '@/lib/auth/resolve-member-id';

export interface CreateCommentParams {
  eventId: number;
  authorId: string;
  /** Canonical member.id; resolved from authorId when omitted. */
  memberId?: number | null;
  authorName: string;
  authorImage: string | null;
  body: string;
}

export const COMMENT_MAX_LENGTH = 2000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function createComment(
  db: Db,
  p: CreateCommentParams,
): Promise<EventComment> {
  const trimmed = p.body.trim();
  if (trimmed.length === 0) {
    throw new Error('Comment body is empty');
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    throw new Error(`Comment body exceeds ${COMMENT_MAX_LENGTH} characters`);
  }
  const memberId =
    p.memberId !== undefined ? p.memberId : await resolveMemberId(db, p.authorId);
  const [row] = await db
    .insert(eventComments)
    .values({
      eventId: p.eventId,
      authorId: p.authorId,
      memberId,
      authorName: p.authorName,
      authorImage: p.authorImage,
      body: trimmed,
    })
    .returning();
  return row as EventComment;
}

export async function listComments(db: Db, eventId: number): Promise<EventComment[]> {
  const rows = await db
    .select()
    .from(eventComments)
    .where(and(eq(eventComments.eventId, eventId), isNull(eventComments.deletedAt)))
    .orderBy(asc(eventComments.createdAt));
  return rows as EventComment[];
}

export async function softDeleteComment(db: Db, commentId: number): Promise<void> {
  await db
    .update(eventComments)
    .set({ deletedAt: new Date() })
    .where(eq(eventComments.id, commentId));
}

export async function getComment(
  db: Db,
  commentId: number,
): Promise<EventComment | undefined> {
  const [row] = await db
    .select()
    .from(eventComments)
    .where(eq(eventComments.id, commentId))
    .limit(1);
  return row as EventComment | undefined;
}
