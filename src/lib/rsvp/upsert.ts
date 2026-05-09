import { and, eq } from 'drizzle-orm';
import { rsvps } from '@/lib/db/schema';
import { resolveMemberId } from '@/lib/auth/resolve-member-id';

export interface UpsertRsvpParams {
  eventId: number;
  userId: string;
  // Optional memberId — callers that already know the canonical id (e.g.
  // routes that have an `authed: AuthedUser` in scope) can pass it to
  // skip the lookup. Anything else falls back to resolveMemberId.
  memberId?: number | null;
  userName: string;
  userImage: string | null;
  status: string;
  remindMe?: boolean;
}

export type UpsertRsvpResult =
  | { action: 'updated'; rsvpId: number }
  | { action: 'inserted' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertRsvp(db: any, p: UpsertRsvpParams): Promise<UpsertRsvpResult> {
  const [existing] = await db
    .select()
    .from(rsvps)
    .where(and(eq(rsvps.eventId, p.eventId), eq(rsvps.userId, p.userId)));

  if (existing) {
    const updateSet: Record<string, unknown> = {
      status: p.status,
      userName: p.userName,
      userImage: p.userImage,
    };
    if (p.remindMe !== undefined) updateSet.remindMe = p.remindMe;
    await db.update(rsvps).set(updateSet).where(eq(rsvps.id, existing.id));
    return { action: 'updated', rsvpId: existing.id };
  }

  const memberId =
    p.memberId !== undefined ? p.memberId : await resolveMemberId(db, p.userId);

  await db.insert(rsvps).values({
    eventId: p.eventId,
    userId: p.userId,
    memberId,
    userName: p.userName,
    userImage: p.userImage,
    status: p.status,
    remindMe: p.remindMe ?? false,
  });
  return { action: 'inserted' };
}
