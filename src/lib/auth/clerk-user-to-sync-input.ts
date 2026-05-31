/**
 * Map a Clerk Backend SDK `User` object to a `ClerkMemberWithMergeInput`.
 *
 * Companion to `clerkUserCreatedToSyncInput` (which maps webhook event
 * data, snake_case JSON). This handles the camelCase Backend SDK
 * resource shape returned by `clerkClient().users.getUser()` and
 * `getUserList()`. Used by `syncClerkMemberOnRead` and the
 * `/api/admin/backfill-clerk` route — both consume the SDK's User type.
 *
 * Picks the primary email by id when present, falling back to the first
 * email address. emailVerified is true only when the chosen email's
 * verification.status === 'verified' — preserved across all callers so
 * the merge gate in syncClerkMemberWithMerge stays uniform.
 */

import type { ClerkMemberWithMergeInput } from '@/lib/auth/sync-clerk-member-with-merge';

export interface ClerkUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification: { status?: string } | null;
  }>;
}

export function clerkUserToSyncInput(user: ClerkUser): ClerkMemberWithMergeInput {
  const primary =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ??
    user.emailAddresses[0];

  return {
    clerkId: user.id,
    name:
      [user.firstName, user.lastName]
        .filter((n): n is string => Boolean(n))
        .join(' ') || null,
    email: primary?.emailAddress ?? null,
    image: user.imageUrl || null,
    emailVerified: primary?.verification?.status === 'verified',
  };
}
