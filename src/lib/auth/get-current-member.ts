/**
 * Resolve the current request's identity to a Member row.
 *
 * Tries the Castalia (Logto / NextAuth) session first. If no Logto
 * identity is found, falls through to the Clerk session.
 *
 * Defensive provisioning: when a valid Clerk session has no matching
 * Member row, calls syncClerkMemberOnRead to provision via the Clerk
 * Backend SDK, then re-queries. Eliminates the single-point-of-failure
 * on `user.created` webhook delivery — every authenticated Clerk user
 * gets a row on first read, regardless of webhook reliability. Sync is
 * blocking-await: the user sees themselves on the very first request.
 *
 * Returns null when no session is active OR when the matching Member
 * row could not be provisioned (Clerk getUser failed). The Logto path
 * has no defensive sync (Logto session population runs the email-match
 * link in auth.ts's jwt callback — the row is linked at signin, not on
 * read).
 */

import { eq } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { auth as nextAuth } from '../../../auth';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { members, type Member } from '@/lib/db/schema';
import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';
import { syncClerkMemberOnRead } from '@/lib/auth/sync-clerk-member-on-read';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCurrentMember(db: any): Promise<Member | null> {
  // Castalia (Logto via NextAuth) session takes precedence. nextAuth() can
  // throw on a malformed / stale session cookie — catch and fall through
  // to Clerk so a bad cookie doesn't crash every render.
  let nextAuthSession: Session | null = null;
  try {
    nextAuthSession = (await nextAuth()) as Session | null;
  } catch (err) {
    console.error('[getCurrentMember] nextAuth() threw:', err instanceof Error ? err.message : String(err));
  }
  const logtoUserId = (nextAuthSession?.user as { logtoUserId?: string } | undefined)?.logtoUserId;
  if (logtoUserId) {
    try {
      const [member] = await db
        .select()
        .from(members)
        .where(eq(members.logtoId, logtoUserId))
        .limit(1);
      if (member) return member;
    } catch (err) {
      console.error('[getCurrentMember] logto member lookup failed:', err instanceof Error ? err.message : String(err));
    }
  }

  // Fall through to Clerk session.
  let userId: string | null | undefined = null;
  try {
    const result = await clerkAuth();
    userId = result.userId;
  } catch (err) {
    console.error('[getCurrentMember] clerkAuth() threw:', err instanceof Error ? err.message : String(err));
  }
  if (userId) {
    try {
      let member = await findMemberByClerkId(db, userId);
      if (!member) {
        // Webhook never fired (or fired and failed). Provision now and
        // re-query so the caller sees a valid row on this same request.
        await syncClerkMemberOnRead(db, userId);
        member = await findMemberByClerkId(db, userId);
      }
      return member ?? null;
    } catch (err) {
      console.error('[getCurrentMember] clerk member lookup/sync failed:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  return null;
}
