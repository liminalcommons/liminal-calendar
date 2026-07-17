import {
  buildNewsletterAudience,
  type AudienceMemberRow,
  type AudienceSubscriberRow,
} from '@/lib/newsletter/audience';

describe('buildNewsletterAudience', () => {
  it('dedupes the union of members and subscribers case-insensitively', () => {
    const members: AudienceMemberRow[] = [
      { email: 'Alice@Example.com', name: 'Alice' },
      { email: 'bob@example.com', name: 'Bob' },
    ];
    const subscribers: AudienceSubscriberRow[] = [
      { email: 'alice@example.com', source: 'rsvp', unsubscribedAt: null }, // dup of Alice
      { email: 'carol@example.com', source: 'signup', unsubscribedAt: null }, // subscriber-only
    ];

    const audience = buildNewsletterAudience(members, subscribers);

    // alice (deduped), bob, carol → 3 unique recipients.
    expect(audience.entries.map((e) => e.email)).toEqual([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
    ]);
    expect(audience.memberCount).toBe(2);
    expect(audience.subscriberCount).toBe(2);
  });

  it('merges sources and keeps a member name over a subscriber-only entry', () => {
    const audience = buildNewsletterAudience(
      [{ email: 'alice@example.com', name: 'Alice' }],
      [{ email: 'ALICE@example.com', source: 'rsvp', unsubscribedAt: null }],
    );
    const alice = audience.entries.find((e) => e.email === 'alice@example.com')!;
    expect(alice.name).toBe('Alice');
    expect(alice.sources).toEqual(['member', 'subscriber:rsvp']);
  });

  it('suppresses unsubscribed addresses even when they are also members', () => {
    const members: AudienceMemberRow[] = [
      { email: 'gone@example.com', name: 'Gone' },
      { email: 'stay@example.com', name: 'Stay' },
    ];
    const subscribers: AudienceSubscriberRow[] = [
      { email: 'gone@example.com', source: 'unsubscribe', unsubscribedAt: new Date().toISOString() },
    ];

    const audience = buildNewsletterAudience(members, subscribers);

    expect(audience.entries.map((e) => e.email)).toEqual(['stay@example.com']);
    expect(audience.suppressedCount).toBe(1);
  });

  it('skips members without an email', () => {
    const audience = buildNewsletterAudience(
      [{ email: null, name: 'No Email' }, { email: 'has@example.com', name: 'Has' }],
      [],
    );
    expect(audience.entries).toHaveLength(1);
    expect(audience.memberCount).toBe(1);
  });
});
