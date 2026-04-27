/**
 * Resolve the current request's identity to a Member row.
 *
 * Tries the Hylo session first (existing users — keeps Hylo flow
 * byte-identical). If no Hylo identity is found, falls through to the
 * Clerk session.
 *
 * Returns null when no session is active OR when the matching Member
 * row hasn't been provisioned yet (first-time Clerk users before any
 * syncClerkMemberWithMerge has run). Caller decides whether to trigger
 * a sync, redirect to /welcome, or treat as unauthenticated.
 *
 * Pure read — no side effects, no DB writes. Sync wiring is the
 * caller's job (typically the API route or middleware).
 */

import { eq } from 'drizzle-orm';
import { auth as hyloAuth } from '../../../auth';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { members, type Member } from '@/lib/db/schema';
import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';

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
    const member = await findMemberByClerkId(db, userId);
    return member ?? null;
  }

  return null;
}
