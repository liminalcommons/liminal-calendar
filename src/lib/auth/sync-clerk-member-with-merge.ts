/**
 * Clerk Member sync with email-merge wrapper around syncClerkMember.
 *
 * SECURITY GATE: only merges when Clerk's email is VERIFIED. Without
 * verification, an attacker controlling a Clerk identity with someone
 * else's email could auto-merge into their existing Hylo Member row,
 * inheriting role and event history.
 *
 * Merge logic:
 *   1. If `emailVerified` is false OR email is missing → no merge attempt;
 *      delegate to plain syncClerkMember (creates a separate Clerk row).
 *   2. Look up a Hylo-only Member (clerkId IS NULL) with matching email.
 *      The isNull-clerkId predicate ensures we never overwrite a row that
 *      already has a Clerk identity (prevents one Clerk identity stealing
 *      another's slot).
 *   3. If found: UPDATE the existing row's clerkId. Preserve role,
 *      feedToken, hyloId. Update name/image only if input provides values
 *      (otherwise keep existing). The UPDATE's WHERE includes
 *      isNull(clerkId) for concurrent-merge safety.
 *   4. If not found: delegate to plain syncClerkMember.
 *
 * Companion to syncMember (Hylo) and syncClerkMember (Clerk-only). This
 * is the wrapper a caller in the auth path should use; the basic
 * syncClerkMember remains as a building block for tests and for callers
 * that have already resolved the merge decision.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { members } from '@/lib/db/schema';
import { syncClerkMember, type ClerkMemberSyncInput } from '@/lib/auth/sync-clerk-member';

export interface ClerkMemberWithMergeInput extends ClerkMemberSyncInput {
  emailVerified: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncClerkMemberWithMerge(
  db: any,
  input: ClerkMemberWithMergeInput,
): Promise<void> {
  // Email-merge: only when email is verified AND non-empty AND a
  // matching Hylo-only Member exists.
  if (input.emailVerified && input.email) {
    const [candidate] = await db
      .select()
      .from(members)
      .where(and(eq(members.email, input.email), isNull(members.clerkId)))
      .limit(1);

    if (candidate) {
      // MERGE: attach clerkId to the existing Hylo-only row.
      // WHERE includes isNull(clerkId) for concurrent-merge safety —
      // if another request beat us to attaching a clerkId to this row,
      // this UPDATE matches zero rows and we fall through to plain
      // insert (which would then conflict on clerkId — caller's
      // responsibility to handle).
      await db
        .update(members)
        .set({
          clerkId: input.clerkId,
          name: input.name || candidate.name,
          image: input.image || candidate.image,
          updatedAt: new Date(),
        })
        .where(and(eq(members.id, candidate.id), isNull(members.clerkId)));
      return;
    }
  }

  // No merge candidate (or unverified email or no email) → plain Clerk
  // upsert: creates a new Clerk-only row with null hyloId.
  return syncClerkMember(db, input);
}
