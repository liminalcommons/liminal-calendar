import { syncMember } from '@/lib/auth/member-sync';

function makeFakeDb() {
  const inserts: Array<{ values: unknown; conflictSet: unknown }> = [];
  const updates: Array<{ set: unknown; whereCalled: boolean }> = [];

  const db = {
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: (opts: { set: unknown }) => {
          inserts.push({ values: v, conflictSet: opts.set });
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

describe('syncMember', () => {
  it('issues an insert with onConflictDoUpdate and follows with a feedToken backfill update', async () => {
    const { db, inserts, updates } = makeFakeDb();
    await syncMember(db, {
      hyloId: 'u-42',
      name: 'Alice',
      email: 'a@x.y',
      image: 'https://img',
      role: 'host',
    });
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].whereCalled).toBe(true);
  });

  it('insert values carry the supplied identity + a generated feedToken', async () => {
    const { db, inserts } = makeFakeDb();
    await syncMember(db, {
      hyloId: 'u-7',
      name: 'Bob',
      email: null,
      image: null,
      role: 'member',
    });
    const v = inserts[0].values as Record<string, unknown>;
    expect(v.hyloId).toBe('u-7');
    expect(v.name).toBe('Bob');
    expect(v.email).toBeNull();
    expect(v.role).toBe('member');
    expect(typeof v.feedToken).toBe('string');
    expect((v.feedToken as string).startsWith('feed_')).toBe(true);
  });

  it('conflict-update set does NOT include role or feedToken (preserves DB values)', async () => {
    const { db, inserts } = makeFakeDb();
    await syncMember(db, {
      hyloId: 'u-1',
      name: 'N',
      email: null,
      image: null,
      role: 'admin',
    });
    const set = inserts[0].conflictSet as Record<string, unknown>;
    expect('role' in set).toBe(false); // don't clobber DB-edited role
    expect('feedToken' in set).toBe(false); // don't rotate feed tokens
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it("defaults name to 'Unknown' and role to 'member' when missing", async () => {
    const { db, inserts } = makeFakeDb();
    await syncMember(db, {
      hyloId: 'u-0',
      name: null,
      email: null,
      image: null,
      role: null,
    });
    const v = inserts[0].values as Record<string, unknown>;
    expect(v.name).toBe('Unknown');
    expect(v.role).toBe('member');
  });

  it('each call produces a unique feedToken (randomness sanity)', async () => {
    const { db, inserts } = makeFakeDb();
    await syncMember(db, { hyloId: 'a', name: null, email: null, image: null, role: null });
    await syncMember(db, { hyloId: 'b', name: null, email: null, image: null, role: null });
    const t1 = (inserts[0].values as Record<string, unknown>).feedToken;
    const t2 = (inserts[1].values as Record<string, unknown>).feedToken;
    expect(t1).not.toBe(t2);
  });
});
