/**
 * Resolve the current request's identity to a Member row.
 *
 * Castalia (Logto via NextAuth) is the sole identity provider. Provision on
 * read: a valid Logto session with no member row yet links/creates one (by
 * email) via syncLogtoMemberOnRead, then re-queries — so a fresh Castalia user
 * maps to a member on their first request instead of 401-ing every protected
 * route. Returns null when no session is active or the row can't be resolved.
 */

import { eq } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { auth as nextAuth } from '../../../auth';
import { members, type Member } from '@/lib/db/schema';
import { syncLogtoMemberOnRead } from '@/lib/auth/sync-logto-member-on-read';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCurrentMember(db: any): Promise<Member | null> {
  // nextAuth() can throw on a malformed / stale session cookie — catch so a
  // bad cookie doesn't crash every render; treat as unauthenticated.
  let session: Session | null = null;
  try {
    session = (await nextAuth()) as Session | null;
  } catch (err) {
    console.error('[getCurrentMember] nextAuth() threw:', err instanceof Error ? err.message : String(err));
  }
  const logtoUser = session?.user as
    | { logtoUserId?: string; email?: string | null; name?: string | null }
    | undefined;
  const logtoUserId = logtoUser?.logtoUserId;
  if (!logtoUserId) return null;

  try {
    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.logtoId, logtoUserId))
      .limit(1);
    if (member) return member;

    // Valid Castalia session but no member row yet — provision on read and
    // re-query so the caller sees a valid row on this same request.
    await syncLogtoMemberOnRead(db, {
      logtoUserId,
      email: logtoUser?.email ?? null,
      name: logtoUser?.name ?? null,
    });
    const [provisioned] = await db
      .select()
      .from(members)
      .where(eq(members.logtoId, logtoUserId))
      .limit(1);
    return provisioned ?? null;
  } catch (err) {
    console.error('[getCurrentMember] logto member lookup/provision failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
