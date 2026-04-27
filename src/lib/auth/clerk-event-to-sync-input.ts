/**
 * Translate a Clerk webhook `user.created` event into the input shape
 * expected by `syncClerkMemberWithMerge`.
 *
 * Returns null for any other event type (caller should ignore).
 *
 * Email verification: looks up the primary email by
 * `primary_email_address_id`; falls back to the first email in the list
 * if no match. `emailVerified` is true when the chosen email's
 * verification.status === 'verified'.
 *
 * Name: combines first_name + last_name with a single space, or null if
 * both are null. (Clerk allows users to register without names.)
 */

import type { WebhookEvent } from '@clerk/backend/webhooks';
import type { ClerkMemberWithMergeInput } from '@/lib/auth/sync-clerk-member-with-merge';

interface ClerkEmailAddress {
  id: string;
  email_address: string;
  verification?: { status?: string } | null;
}

export function clerkUserCreatedToSyncInput(
  event: WebhookEvent,
): ClerkMemberWithMergeInput | null {
  if (event.type !== 'user.created') return null;

  // The user.created data shape is well-defined by Clerk; cast for
  // ergonomic field access (the WebhookEvent union is heavily branded).
  const u = event.data as unknown as {
    id: string;
    email_addresses: ClerkEmailAddress[];
    primary_email_address_id: string | null;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
  };

  const primary =
    u.email_addresses.find((e) => e.id === u.primary_email_address_id) ??
    u.email_addresses[0];

  const email = primary?.email_address ?? null;
  const emailVerified = primary?.verification?.status === 'verified';

  const name =
    [u.first_name, u.last_name].filter((n): n is string => Boolean(n)).join(' ') || null;

  return {
    clerkId: u.id,
    name,
    email,
    image: u.image_url ?? null,
    emailVerified,
  };
}
