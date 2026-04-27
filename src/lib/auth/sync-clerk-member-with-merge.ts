/**
 * Clerk Member sync with email-merge wrapper around syncClerkMember.
 *
 * SECURITY GATE: only merges when Clerk's email is VERIFIED. Without
 * verification, an attacker controlling a Clerk identity with someone
 * else's email could auto-merge into their existing Hylo Member row,
 * inheriting role and event history.
 *
 * Decision tree:
 *   1. If a Member already has this clerkId → delegate to syncClerkMember
 *      (handles returning-user upsert via onConflictDoUpdate). Skips merge.
 *      Prevents the late-verification edge case where a returning user
 *      whose email becomes verified would otherwise hit a unique-violation
 *      on the merge UPDATE.
 *   2. If `emailVerified` is false OR email is missing → no merge attempt;
 *      delegate to plain syncClerkMember (creates a separate Clerk row).
 *   3. Look up a Hylo-only Member (clerkId IS NULL) with matching email.
 *      Email comparison is case-insensitive (LOWER(email) on both sides)
 *      since users may sign up with mixed case across providers.
 *      The isNull-clerkId predicate ensures we never overwrite a row that
 *      already has a Clerk identity.
 *   4. If found: UPDATE the existing row's clerkId. Preserve role,
 *      feedToken, hyloId. Update name/image only if input provides values.
 *      The UPDATE's WHERE includes isNull(clerkId) for concurrent-merge
 *      safety. If the UPDATE matches zero rows (another concurrent merge
 *      beat us), the function returns silently — caller's
 *      findMemberByClerkId(input.clerkId) will return undefined,
 *      signalling retry or escalation is needed.
 *   5. If not found: delegate to plain syncClerkMember (creates separate row).
 *
 * Companion to syncMember (Hylo) and syncClerkMember (Clerk-only). This
 * is the wrapper a caller in the auth path should use; the basic
 * syncClerkMember remains as a building block for tests and for callers
 * that have already resolved the merge decision.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { members } from '@/lib/db/schema';
import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';
import { syncClerkMember, type ClerkMemberSyncInput } from '@/lib/auth/sync-clerk-member';

export interface ClerkMemberWithMergeInput extends ClerkMemberSyncInput {
  emailVerified: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncClerkMemberWithMerge(
  db: any,
  input: ClerkMemberWithMergeInput,
): Promise<void> {
  // Step 1: returning Clerk user → plain upsert via syncClerkMember.
  // Skips merge logic entirely (would otherwise risk a unique violation
  // when this clerkId is already on another row).
  const existing = await findMemberByClerkId(db, input.clerkId);
  if (existing) {
    return syncClerkMember(db, input);
  }

  // Step 2: email-merge gate — only when email is verified AND non-empty.
  if (input.emailVerified && input.email) {
    const emailLower = input.email.toLowerCase();

    // Step 3: find a matching Hylo-only Member. LOWER() on both sides for
    // case-insensitive comparison (Hylo and Clerk may report different
    // casing for the same email).
    const [candidate] = await db
      .select()
      .from(members)
      .where(
        and(
          sql`LOWER(${members.email}) = ${emailLower}`,
          isNull(members.clerkId),
        ),
      )
      .limit(1);

    if (candidate) {
      // Step 4: MERGE. Concurrent-merge safety via isNull(clerkId) on
      // the UPDATE WHERE — if another request beat us, this matches zero
      // rows and we return silently. Caller's findMemberByClerkId will
      // return undefined, prompting retry.
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

  // Step 5: no merge possible → plain Clerk upsert (new Clerk-only row,
  // null hyloId).
  return syncClerkMember(db, input);
}
