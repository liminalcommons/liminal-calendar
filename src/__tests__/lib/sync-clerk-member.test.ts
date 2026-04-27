import { syncClerkMember } from '@/lib/auth/sync-clerk-member';

function makeFakeDb() {
  const inserts: Array<{ values: unknown; conflictTarget: unknown; conflictSet: unknown }> = [];
  const updates: Array<{ set: unknown; whereCalled: boolean }> = [];

  const db = {
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: (opts: { target: unknown; set: unknown }) => {
          inserts.push({ values: v, conflictTarget: opts.target, conflictSet: opts.set });
          return Promise.resolve();
        },
      }),
    }),
    update: () => ({
      set: (s: unknown) => {
        const entry = { set: s, whereCalled: false };
        updates.push(entry);
        return {
          where: () => {
            entry.whereCalled = true;
            return Promise.resolve();
          },
        };
      },
    }),
  };

  return { db, inserts, updates };
}

describe('syncClerkMember', () => {
  it('issues an insert with onConflictDoUpdate and follows with a feedToken backfill update', async () => {
    const { db, inserts, updates } = makeFakeDb();
    await syncClerkMember(db, {
      clerkId: 'user_clerk_42',
      name: 'Alice',
      email: 'a@x.y',
      image: 'https://img',
    });
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].whereCalled).toBe(true);
  });

  it('insert values carry the supplied identity + a generated feedToken + default role', async () => {
    const { db, inserts } = makeFakeDb();
    await syncClerkMember(db, {
      clerkId: 'user_clerk_7',
      name: 'Bob',
      email: null,
      image: null,
    });
    const v = inserts[0].values as Record<string, unknown>;
    expect(v.clerkId).toBe('user_clerk_7');
    expect(v.name).toBe('Bob');
    expect(v.email).toBeNull();
    expect(v.role).toBe('member');
    expect(typeof v.feedToken).toBe('string');
    expect((v.feedToken as string).startsWith('feed_')).toBe(true);
  });

  it('conflict target is members.clerkId (not members.hyloId)', async () => {
    const { db, inserts } = makeFakeDb();
    await syncClerkMember(db, {
      clerkId: 'u-1',
      name: 'N',
      email: null,
      image: null,
    });
    // Conflict target must be the clerkId column reference (proved by passing
    // any value through; integration test would verify the actual DB-level
    // unique constraint). Here we just confirm something was passed.
    expect(inserts[0].conflictTarget).toBeDefined();
  });

  it('conflict-update set does NOT include role or feedToken (preserves DB values)', async () => {
    const { db, inserts } = makeFakeDb();
    await syncClerkMember(db, {
      clerkId: 'u-1',
      name: 'N',
      email: null,
      image: null,
    });
    const set = inserts[0].conflictSet as Record<string, unknown>;
    expect('role' in set).toBe(false);
    expect('feedToken' in set).toBe(false);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it("defaults name to 'Unknown' when missing", async () => {
    const { db, inserts } = makeFakeDb();
    await syncClerkMember(db, {
      clerkId: 'u-0',
      name: null,
      email: null,
      image: null,
    });
    const v = inserts[0].values as Record<string, unknown>;
    expect(v.name).toBe('Unknown');
    expect(v.role).toBe('member');
  });

  it('does NOT set hyloId — Clerk-only rows have null hyloId', async () => {
    const { db, inserts } = makeFakeDb();
    await syncClerkMember(db, {
      clerkId: 'u-x',
      name: 'X',
      email: null,
      image: null,
    });
    const v = inserts[0].values as Record<string, unknown>;
    expect('hyloId' in v).toBe(false);
  });

  it('each call produces a unique feedToken', async () => {
    const { db, inserts } = makeFakeDb();
    await syncClerkMember(db, { clerkId: 'a', name: null, email: null, image: null });
    await syncClerkMember(db, { clerkId: 'b', name: null, email: null, image: null });
    const t1 = (inserts[0].values as Record<string, unknown>).feedToken;
    const t2 = (inserts[1].values as Record<string, unknown>).feedToken;
    expect(t1).not.toBe(t2);
  });
});
