/**
 * Build the monthly-update recipient list — the "generate the mailing list
 * automatically" ask, kept entirely in-app.
 *
 * Audience = deduped union of:
 *   - members with an email (`members.email`)
 *   - newsletter opt-ins (`newsletter_subscribers`)
 * minus any address that has unsubscribed (a `newsletter_subscribers` row with
 * `unsubscribed_at` set is a suppression entry and wins over any membership).
 *
 * Pure — no DB, no clock — so the dedupe/suppression rules are unit-testable.
 * Emails are compared case-insensitively; the lowercased form is what we send
 * to (matching how addNewsletterSubscriber stores them).
 */

export interface AudienceMemberRow {
  email: string | null;
  name: string | null;
}

export interface AudienceSubscriberRow {
  email: string;
  source: string;
  unsubscribedAt: string | Date | null;
}

export interface AudienceEntry {
  email: string;
  name: string | null;
  /** Where this address came from, e.g. ['member','subscriber:rsvp']. */
  sources: string[];
}

export interface NewsletterAudience {
  entries: AudienceEntry[];
  memberCount: number;
  subscriberCount: number;
  suppressedCount: number;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function buildNewsletterAudience(
  members: AudienceMemberRow[],
  subscribers: AudienceSubscriberRow[],
): NewsletterAudience {
  // Suppression set first — any unsubscribed address is excluded everywhere.
  const suppressed = new Set<string>();
  for (const s of subscribers) {
    if (s.unsubscribedAt) suppressed.add(normalize(s.email));
  }

  const byEmail = new Map<string, AudienceEntry>();

  const add = (rawEmail: string, name: string | null, source: string) => {
    const email = normalize(rawEmail);
    if (!email || suppressed.has(email)) return;
    const existing = byEmail.get(email);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!existing.name && name) existing.name = name;
    } else {
      byEmail.set(email, { email, name: name ?? null, sources: [source] });
    }
  };

  let memberCount = 0;
  for (const m of members) {
    if (!m.email) continue;
    memberCount += 1;
    add(m.email, m.name, 'member');
  }

  let subscriberCount = 0;
  for (const s of subscribers) {
    if (s.unsubscribedAt) continue; // suppression row, not a recipient
    subscriberCount += 1;
    add(s.email, null, `subscriber:${s.source}`);
  }

  const entries = Array.from(byEmail.values()).sort((a, b) =>
    a.email.localeCompare(b.email),
  );

  return {
    entries,
    memberCount,
    subscriberCount,
    suppressedCount: suppressed.size,
  };
}
