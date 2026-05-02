/**
 * Defensive provisioning helper. When a read path observes a valid
 * Clerk session that has no corresponding `members` row (the webhook
 * never fired, or fired and failed), this helper fetches the Clerk
 * profile via the Backend SDK and runs the same sync logic the webhook
 * uses. Eliminates the single-point-of-failure on `user.created`
 * webhook delivery.
 *
 * Companion to clerkUserCreatedToSyncInput (which maps webhook event
 * data) — this maps the Backend SDK's User resource. Same logical shape
 * (primary email + verification, first/last name, image URL), different
 * casing convention (camelCase here vs snake_case in webhook JSON).
 *
 * Failure mode: if the Clerk getUser call rejects (e.g., user deleted,
 * network blip), this helper SWALLOWS the error and returns undefined.
 * Callers are read paths (e.g., GET /api/profile, GET /api/admin/members);
 * crashing them on a transient Clerk-side failure would be worse than
 * temporarily not auto-provisioning. Logged for observability.
 *
 * Caller is responsible for deciding when to invoke (typically: valid
 * Clerk session + no member row found by clerkId).
 */

import { clerkClient } from '@clerk/nextjs/server';
import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';

interface ClerkUserShape {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncClerkMemberOnRead(db: any, clerkId: string): Promise<void> {
  let user: ClerkUserShape;
  try {
    const cc = await clerkClient();
    user = (await cc.users.getUser(clerkId)) as unknown as ClerkUserShape;
  } catch (err) {
    console.error('[syncClerkMemberOnRead] Clerk getUser failed:', clerkId, err);
    return;
  }

  const primary =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ??
    user.emailAddresses[0];

  const email = primary?.emailAddress ?? null;
  const emailVerified = primary?.verification?.status === 'verified';
  const name =
    [user.firstName, user.lastName].filter((n): n is string => Boolean(n)).join(' ') || null;
  const image = user.imageUrl || null;

  await syncClerkMemberWithMerge(db, {
    clerkId: user.id,
    name,
    email,
    image,
    emailVerified,
  });
}
