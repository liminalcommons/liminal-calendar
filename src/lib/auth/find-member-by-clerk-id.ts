/**
 * Look up a Member by Clerk identity.
 *
 * Returns undefined when no member is found (e.g., the Clerk user has not
 * yet been synced to the members table). Caller decides whether to provision
 * a new row or treat the user as unknown.
 *
 * Companion to syncMember() (which handles Hylo identity). When account
 * linking lands in S6, both lookups will be consulted to find any existing
 * row that should be reused/merged.
 */

import { eq } from 'drizzle-orm';
import { members, type Member } from '@/lib/db/schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findMemberByClerkId(
  db: any,
  clerkId: string,
): Promise<Member | undefined> {
  const [row] = await db
    .select()
    .from(members)
    .where(eq(members.clerkId, clerkId))
    .limit(1);
  return row;
}
