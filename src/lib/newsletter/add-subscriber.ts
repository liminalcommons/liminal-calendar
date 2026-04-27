/**
 * Add an email to the newsletter opt-in list.
 *
 * Idempotent: duplicate emails are no-ops (onConflictDoNothing on the
 * unique email constraint). Email is lowercased before insert so
 * case-mismatched re-subscribes don't create duplicates.
 *
 * `source` records the user-visible flow that produced the subscription:
 *   - 'rsvp'   — opt-in checkbox on event RSVP form
 *   - 'signup' — opt-in during account creation
 *   - 'manual' — admin-added (back-office or import)
 */

import { newsletterSubscribers } from '@/lib/db/schema';

export type NewsletterSource = 'rsvp' | 'signup' | 'manual';

export interface AddSubscriberInput {
  email: string;
  source: NewsletterSource;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addNewsletterSubscriber(db: any, input: AddSubscriberInput): Promise<void> {
  await db
    .insert(newsletterSubscribers)
    .values({
      email: input.email.toLowerCase(),
      source: input.source,
    })
    .onConflictDoNothing();
}
