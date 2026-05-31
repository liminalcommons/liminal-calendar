import type { NextRequest } from 'next/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { db } from '@/lib/db';
import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';
import { clerkUserCreatedToSyncInput } from '@/lib/auth/clerk-event-to-sync-input';

export const dynamic = 'force-dynamic';

/**
 * Clerk webhook handler.
 *
 * Verifies the request signature via Clerk's `verifyWebhook` (uses svix
 * under the hood with `CLERK_WEBHOOK_SIGNING_SECRET` from env).
 *
 * On `user.created` events: provisions a Member row via
 * syncClerkMemberWithMerge — which handles email-merge into existing
 * Hylo-only Members when the email is verified, or creates a separate
 * Clerk-only row otherwise.
 *
 * Other event types are accepted (200) but ignored. Adding handlers
 * for `user.updated` / `user.deleted` is a follow-up if needed.
 *
 * Configure in Clerk dashboard → Configure → Webhooks:
 *   Endpoint URL: https://calendar.castalia.one/api/webhooks/clerk
 *   Events: user.created (plus optional user.updated/deleted later)
 *   Copy signing secret into .env.local as CLERK_WEBHOOK_SIGNING_SECRET.
 *
 * See docs/clerk-config.md for the full configuration record.
 */
export async function POST(req: NextRequest) {
  // svix-id is the per-message id Clerk includes in webhook headers.
  // Log it on errors so retries can be correlated and replays detected
  // in production observability.
  const svixId = req.headers.get('svix-id') ?? 'unknown';

  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error(`[POST /api/webhooks/clerk] signature verification failed (svix-id=${svixId}):`, err);
    return new Response('Webhook verification failed', { status: 400 });
  }

  try {
    const input = clerkUserCreatedToSyncInput(evt);
    if (input) {
      await syncClerkMemberWithMerge(db, input);
    }
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error(`[POST /api/webhooks/clerk] handler error (svix-id=${svixId}):`, err);
    return new Response('Webhook handler error', { status: 500 });
  }
}
