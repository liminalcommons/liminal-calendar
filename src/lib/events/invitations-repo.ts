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

  // Resolve invitee memberIds in parallel.
  const memberIds = await Promise.all(
    deduped.map((inv) => resolveMemberId(db, inv.userId)),
  );

  // Replace-set: delete existing rows, then insert the new set. The Neon HTTP
  // driver does NOT support db.transaction() (it batches but won't roll back),
  // so this runs as two sequential statements. The window between them is
  // tiny and a concurrent reader of event_invitations would see an empty
  // set briefly — acceptable: invitations are eventually-consistent for
  // the UI, and the unique (event_id, invitee_user_id) constraint still
  // prevents duplicate inserts within a single call.
  await db.delete(eventInvitations).where(eq(eventInvitations.eventId, eventId));

  if (deduped.length > 0) {
    await db.insert(eventInvitations).values(
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
