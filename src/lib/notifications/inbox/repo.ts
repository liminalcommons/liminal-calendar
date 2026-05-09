import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { notifications, type Notification } from '@/lib/db/schema';
import { resolveMemberId } from '@/lib/auth/resolve-member-id';

/**
 * Inbox-event repo. Pure CRUD over the `notifications` table; all triggers
 * (cron, route handlers, future webhook consumers) call createNotification
 * to materialize an inbox row. The bell UI calls listNotificationsForUser +
 * countUnseen; opening the dropdown calls markAllSeen.
 *
 * Does NOT touch `notification_log` — that's the cron's delivery dedupe
 * record and lives a different life. See lib/db/schema.ts for the
 * ontological split rationale.
 */

export interface CreateNotificationParams {
  userId: string;
  /** Canonical recipient id; resolved from userId when omitted. */
  memberId?: number | null;
  type: string;
  eventId?: number | null;
  actorId?: string | null;
  /** Canonical actor id; resolved from actorId when omitted. */
  actorMemberId?: number | null;
  actorName?: string | null;
  title: string;
  body?: string | null;
  url: string;
  payload?: Record<string, unknown> | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function createNotification(
  db: Db,
  p: CreateNotificationParams,
): Promise<Notification> {
  const memberId =
    p.memberId !== undefined ? p.memberId : await resolveMemberId(db, p.userId);
  const actorMemberId =
    p.actorMemberId !== undefined
      ? p.actorMemberId
      : p.actorId
        ? await resolveMemberId(db, p.actorId)
        : null;

  const [row] = await db
    .insert(notifications)
    .values({
      userId: p.userId,
      memberId,
      type: p.type,
      eventId: p.eventId ?? null,
      actorId: p.actorId ?? null,
      actorMemberId,
      actorName: p.actorName ?? null,
      title: p.title,
      body: p.body ?? null,
      url: p.url,
      payload: p.payload ?? null,
    })
    .returning();
  return row as Notification;
}

export interface ListNotificationsOptions {
  limit?: number;
  unseenOnly?: boolean;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function listNotificationsForUser(
  db: Db,
  userId: string,
  opts: ListNotificationsOptions = {},
): Promise<Notification[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const where = opts.unseenOnly
    ? and(eq(notifications.userId, userId), isNull(notifications.seenAt))
    : eq(notifications.userId, userId);
  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows as Notification[];
}

export async function markAllSeen(db: Db, userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ seenAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.seenAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function countUnseen(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.seenAt)));
  return Number(row?.count ?? 0);
}
