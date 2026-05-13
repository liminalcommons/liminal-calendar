import { and, eq, isNotNull } from 'drizzle-orm';
import { members, eventMutes, pushSubscriptions, notificationLog } from '@/lib/db/schema';

export const BROADCAST_ENABLED = process.env.BROADCAST_ENABLED === 'true';

export const BROADCAST_START_TYPE = 'broadcast.start';

export interface BroadcastEvent {
  id: number;
  visibility: string;
  startsAt: Date;
}

export interface BroadcastRecipient {
  memberId: number;
  userId: string;
}

/**
 * Recipients for at-start broadcast push:
 *   all members with active push_subscription
 *   MINUS members who muted this event
 *   MINUS users already logged with type='broadcast.start' for this event
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeBroadcastRecipients(db: any, event: BroadcastEvent): Promise<BroadcastRecipient[]> {
  if (event.visibility === 'private') return [];

  const allMembers = await db
    .select({ memberId: members.id, hyloId: members.hyloId })
    .from(members)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, members.hyloId))
    .where(isNotNull(members.hyloId));

  if (allMembers.length === 0) return [];

  const mutes = await db
    .select({ memberId: eventMutes.memberId })
    .from(eventMutes)
    .where(eq(eventMutes.eventId, event.id));
  const mutedSet = new Set<number>(mutes.map((r: { memberId: number }) => r.memberId));

  const alreadySent = await db
    .select({ userId: notificationLog.userId })
    .from(notificationLog)
    .where(and(eq(notificationLog.eventId, event.id), eq(notificationLog.type, BROADCAST_START_TYPE)));
  const sentSet = new Set<string>(alreadySent.map((r: { userId: string }) => r.userId));

  const out: BroadcastRecipient[] = [];
  const seen = new Set<number>();
  for (const m of allMembers as { memberId: number; hyloId: string }[]) {
    if (seen.has(m.memberId)) continue;
    if (mutedSet.has(m.memberId)) continue;
    if (sentSet.has(m.hyloId)) continue;
    seen.add(m.memberId);
    out.push({ memberId: m.memberId, userId: m.hyloId });
  }
  return out;
}
