import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventInvitations } from '@/lib/db/schema';

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

  await db.transaction(async (tx) => {
    await tx.delete(eventInvitations).where(eq(eventInvitations.eventId, eventId));

    if (deduped.length > 0) {
      await tx.insert(eventInvitations).values(
        deduped.map((inv) => ({
          eventId,
          inviteeUserId: inv.userId,
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
