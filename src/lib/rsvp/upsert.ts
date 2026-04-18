import { and, eq } from 'drizzle-orm';
import { rsvps } from '@/lib/db/schema';

export interface UpsertRsvpParams {
  eventId: number;
  userId: string;
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

  await db.insert(rsvps).values({
    eventId: p.eventId,
    userId: p.userId,
    userName: p.userName,
    userImage: p.userImage,
    status: p.status,
    remindMe: p.remindMe ?? false,
  });
  return { action: 'inserted' };
}
