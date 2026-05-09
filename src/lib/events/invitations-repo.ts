import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventInvitations } from '@/lib/db/schema';
import { resolveMemberId } from '@/lib/auth/resolve-member-id';

export const INVITEE_CAP_MEMBER = 10;

export type Invitee = { userId: string; name: string; image?: string | null };

/**
 * Dedupes invitees by userId (last-wins) and throws INVITEE_CAP_EXCEEDED
 * if a member organizer exceeds the cap. Returns the deduped list.
 * Safe to call before the event row exists (no DB I/O).
 */
export function validateInviteeCap({
  organizerRole,
  invitees,
}: {
  organizerRole: 'member' | 'host' | 'admin';
  invitees: Invitee[];
}): Invitee[] {
  const seen = new Map<string, Invitee>();
  for (const inv of invitees) {
    seen.set(inv.userId, inv);
  }
  const deduped = Array.from(seen.values());

  if (organizerRole === 'member' && deduped.length > INVITEE_CAP_MEMBER) {
    throw new Error('INVITEE_CAP_EXCEEDED');
  }

  return deduped;
}

export async function setEventInvitations({
  eventId,
  organizerRole,
  invitees,
}: {
  eventId: number;
  organizerRole: 'member' | 'host' | 'admin';
  invitees: Invitee[];
}): Promise<void> {
  // Dedupe by userId (last-wins)
  const seen = new Map<string, Invitee>();
  for (const inv of invitees) {
    seen.set(inv.userId, inv);
  }
  const deduped = Array.from(seen.values());

  if (organizerRole === 'member' && deduped.length > INVITEE_CAP_MEMBER) {
    throw new Error('INVITEE_CAP_EXCEEDED');
  }

  // Resolve invitee memberIds in parallel BEFORE opening the transaction.
  // Each call is one indexed SELECT — small fan-out, but doing them inside
  // the tx would serialize them and lengthen the lock window.
  const memberIds = await Promise.all(
    deduped.map((inv) => resolveMemberId(db, inv.userId)),
  );

  await db.transaction(async (tx) => {
    await tx.delete(eventInvitations).where(eq(eventInvitations.eventId, eventId));

    if (deduped.length > 0) {
      await tx.insert(eventInvitations).values(
        deduped.map((inv, i) => ({
          eventId,
          inviteeUserId: inv.userId,
          memberId: memberIds[i],
          inviteeName: inv.name,
          inviteeImage: inv.image ?? null,
          invitedAt: new Date(),
        })),
      );
    }
  });
}

export async function listEventInvitations(
  eventId: number,
): Promise<
  Array<{
    inviteeUserId: string;
    inviteeName: string;
    inviteeImage: string | null;
    invitedAt: Date | null;
  }>
> {
  return db
    .select({
      inviteeUserId: eventInvitations.inviteeUserId,
      inviteeName: eventInvitations.inviteeName,
      inviteeImage: eventInvitations.inviteeImage,
      invitedAt: eventInvitations.invitedAt,
    })
    .from(eventInvitations)
    .where(eq(eventInvitations.eventId, eventId))
    .orderBy(eventInvitations.invitedAt);
}
