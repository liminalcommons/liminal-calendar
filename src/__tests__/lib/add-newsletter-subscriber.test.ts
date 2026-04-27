import { addNewsletterSubscriber } from '@/lib/newsletter/add-subscriber';

function makeFakeDb() {
  const inserts: Array<{ values: unknown; conflictBranch: 'doNothing' | 'doUpdate' | 'none' }> = [];

  const db = {
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoNothing: () => {
          inserts.push({ values: v, conflictBranch: 'doNothing' });
          return Promise.resolve();
        },
      }),
    }),
  };

  return { db, inserts };
}

describe('addNewsletterSubscriber', () => {
  it('inserts a new subscriber with onConflictDoNothing', async () => {
    const { db, inserts } = makeFakeDb();
    await addNewsletterSubscriber(db, { email: 'a@x.y', source: 'rsvp' });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].conflictBranch).toBe('doNothing');
  });

  it('insert values carry email + source', async () => {
    const { db, inserts } = makeFakeDb();
    await addNewsletterSubscriber(db, { email: 'b@x.y', source: 'signup' });
    const v = inserts[0].values as Record<string, unknown>;
    expect(v.email).toBe('b@x.y');
    expect(v.source).toBe('signup');
  });

  it('email is lowercased before insert', async () => {
    // Newsletter subscribe should be case-insensitive — same email in
    // mixed case should not create a duplicate row.
    const { db, inserts } = makeFakeDb();
    await addNewsletterSubscriber(db, { email: 'MixedCase@Example.com', source: 'manual' });
    const v = inserts[0].values as Record<string, unknown>;
    expect(v.email).toBe('mixedcase@example.com');
  });

  it('accepts all three valid sources', async () => {
    const { db, inserts } = makeFakeDb();
    await addNewsletterSubscriber(db, { email: 'a@x.y', source: 'rsvp' });
    await addNewsletterSubscriber(db, { email: 'b@x.y', source: 'signup' });
    await addNewsletterSubscriber(db, { email: 'c@x.y', source: 'manual' });
    expect(inserts).toHaveLength(3);
    expect((inserts[0].values as Record<string, unknown>).source).toBe('rsvp');
    expect((inserts[1].values as Record<string, unknown>).source).toBe('signup');
    expect((inserts[2].values as Record<string, unknown>).source).toBe('manual');
  });
});
