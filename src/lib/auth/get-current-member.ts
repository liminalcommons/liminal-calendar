/**
 * Resolve the current request's identity to a Member row.
 *
 * Tries the Hylo session first (existing users — keeps Hylo flow
 * byte-identical). If no Hylo identity is found, falls through to the
 * Clerk session.
 *
 * Defensive provisioning: when a valid Clerk session has no matching
 * Member row, calls syncClerkMemberOnRead to provision via the Clerk
 * Backend SDK, then re-queries. Eliminates the single-point-of-failure
 * on `user.created` webhook delivery — every authenticated Clerk user
 * gets a row on first read, regardless of webhook reliability. Sync is
 * blocking-await: the user sees themselves on the very first request.
 *
 * Returns null when no session is active OR when the matching Member
 * row could not be provisioned (Clerk getUser failed). The Hylo path
 * has no defensive sync (Hylo session population already runs syncMember
 * in auth.ts's jwt callback — the row is created at signin, not on read).
 */

import { eq } from 'drizzle-orm';
import { auth as hyloAuth } from '../../../auth';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { members, type Member } from '@/lib/db/schema';
import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';
import { syncClerkMemberOnRead } from '@/lib/auth/sync-clerk-member-on-read';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCurrentMember(db: any): Promise<Member | null> {
  // Hylo session takes precedence — existing users see no flow change.
  const hyloSession = await hyloAuth();
  const hyloId = (hyloSession?.user as { hyloId?: string } | undefined)?.hyloId;
  if (hyloId) {
    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.hyloId, hyloId))
      .limit(1);
    return member ?? null;
  }

  // Fall through to Clerk session.
  const { userId } = await clerkAuth();
  if (userId) {
    let member = await findMemberByClerkId(db, userId);
    if (!member) {
      // Webhook never fired (or fired and failed). Provision now and
      // re-query so the caller sees a valid row on this same request.
      await syncClerkMemberOnRead(db, userId);
      member = await findMemberByClerkId(db, userId);
    }
    return member ?? null;
  }

  return null;
}
