/**
 * Defensive provisioning helper. When a read path observes a valid
 * Clerk session that has no corresponding `members` row (the webhook
 * never fired, or fired and failed), this helper fetches the Clerk
 * profile via the Backend SDK and runs the same sync logic the webhook
 * uses. Eliminates the single-point-of-failure on `user.created`
 * webhook delivery.
 *
 * Mapping (User → ClerkMemberWithMergeInput) lives in the shared
 * `clerkUserToSyncInput` helper, used here and by
 * `/api/admin/backfill-clerk`. Both consume the SDK's User shape.
 *
 * Failure mode: if the Clerk getUser call OR the inner
 * syncClerkMemberWithMerge rejects (e.g., user deleted, network blip,
 * DB outage, schema violation), this helper SWALLOWS the error and
 * returns undefined. Callers are read paths (e.g., GET /api/profile,
 * GET /api/admin/members); crashing them on a transient backend
 * failure would be worse than temporarily not auto-provisioning.
 * Logged for observability.
 *
 * Caller is responsible for deciding when to invoke (typically: valid
 * Clerk session + no member row found by clerkId).
 */

import { clerkClient } from '@clerk/nextjs/server';
import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';
import {
  clerkUserToSyncInput,
  type ClerkUser,
} from '@/lib/auth/clerk-user-to-sync-input';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncClerkMemberOnRead(db: any, clerkId: string): Promise<void> {
  let user: ClerkUser;
  try {
    const cc = await clerkClient();
    user = (await cc.users.getUser(clerkId)) as unknown as ClerkUser;
  } catch (err) {
    console.error('[syncClerkMemberOnRead] Clerk getUser failed:', clerkId, err);
    return;
  }

  try {
    await syncClerkMemberWithMerge(db, clerkUserToSyncInput(user));
  } catch (err) {
    console.error('[syncClerkMemberOnRead] sync failed:', clerkId, err);
  }
}
