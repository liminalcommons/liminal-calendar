import { and, eq, or, isNotNull } from 'drizzle-orm';
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

  // Pull every (memberId, push subscription userId) pairing. The push
  // subscription's user_id is whichever identity (logtoId or clerkId)
  // was current when the subscription was created.
  const allMembers = await db
    .select({ memberId: members.id, userId: pushSubscriptions.userId })
    .from(members)
    .innerJoin(
      pushSubscriptions,
      or(
        eq(pushSubscriptions.userId, members.logtoId),
        eq(pushSubscriptions.userId, members.clerkId),
      ),
    )
    .where(or(isNotNull(members.logtoId), isNotNull(members.clerkId)));

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
  for (const m of allMembers as { memberId: number; userId: string }[]) {
    if (seen.has(m.memberId)) continue;
    if (mutedSet.has(m.memberId)) continue;
    if (sentSet.has(m.userId)) continue;
    seen.add(m.memberId);
    out.push({ memberId: m.memberId, userId: m.userId });
  }
  return out;
}
