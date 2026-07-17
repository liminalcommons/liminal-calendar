/**
 * DB access for the mailing list — fetch the recipient audience and record
 * unsubscribes. Kept apart from the pure audience math (audience.ts).
 */

import { isNotNull } from 'drizzle-orm';
import { members, newsletterSubscribers } from '@/lib/db/schema';
import {
  buildNewsletterAudience,
  type NewsletterAudience,
} from './audience';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Load members-with-email + subscribers and build the deduped audience. */
export async function fetchNewsletterAudience(db: Db): Promise<NewsletterAudience> {
  const memberRows = await db
    .select({ email: members.email, name: members.name })
    .from(members)
    .where(isNotNull(members.email));

  const subscriberRows = await db
    .select({
      email: newsletterSubscribers.email,
      source: newsletterSubscribers.source,
      unsubscribedAt: newsletterSubscribers.unsubscribedAt,
    })
    .from(newsletterSubscribers);

  return buildNewsletterAudience(memberRows, subscriberRows);
}

/**
 * Record an unsubscribe. Idempotent: an existing subscriber row is flagged;
 * an address with no row (member-only) gets a suppression row inserted so the
 * opt-out is durable across future sends. Email is lowercased to match storage.
 */
export async function suppressEmail(db: Db, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await db
    .insert(newsletterSubscribers)
    .values({
      email: normalized,
      source: 'unsubscribe',
      unsubscribedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: newsletterSubscribers.email,
      set: { unsubscribedAt: new Date() },
    });
}
