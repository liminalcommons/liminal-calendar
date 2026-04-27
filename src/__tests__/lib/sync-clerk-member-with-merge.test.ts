import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';

interface Calls {
  selects: Array<{ where: unknown; limit: unknown }>;
  updates: Array<{ set: unknown; where: unknown }>;
  inserts: Array<{ values: unknown; conflictTarget: unknown; conflictSet: unknown }>;
}

function makeFakeDb(opts: {
  byClerkId?: Record<string, unknown> | null;
  candidate?: Record<string, unknown> | null;
} = {}) {
  // Two-step select sequence: 1st = findMemberByClerkId, 2nd = email-merge SELECT.
  const sequence: unknown[][] = [
    opts.byClerkId ? [opts.byClerkId] : [],
    opts.candidate ? [opts.candidate] : [],
  ];
  const calls: Calls = { selects: [], updates: [], inserts: [] };

  const db = {
    select: () => ({
      from: () => ({
        where: (predicate: unknown) => ({
          limit: (n: unknown) => {
            calls.selects.push({ where: predicate, limit: n });
            const next = sequence.shift() ?? [];
            return Promise.resolve(next);
          },
        }),
      }),
    }),
    update: () => ({
      set: (s: unknown) => {
        const entry: { set: unknown; where: unknown } = { set: s, where: null };
        calls.updates.push(entry);
        return {
          where: (predicate: unknown) => {
            entry.where = predicate;
            return Promise.resolve();
          },
        };
      },
    }),
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: (opts: { target: unknown; set: unknown }) => {
          calls.inserts.push({ values: v, conflictTarget: opts.target, conflictSet: opts.set });
          return Promise.resolve();
        },
      }),
    }),
  };

  return { db, calls };
}

describe('syncClerkMemberWithMerge', () => {
  it('MERGES when emailVerified + matching Hylo-only Member exists', async () => {
    const candidate = { id: 7, hyloId: 'h-1', clerkId: null, name: 'Alice', email: 'a@x.y' };
    const { db, calls } = makeFakeDb({ candidate });

    await syncClerkMemberWithMerge(db, {
      clerkId: 'clerk_new',
      name: 'Alice (Clerk)',
      email: 'a@x.y',
      image: null,
      emailVerified: true,
    });

    // MERGE path: 2 selects (findMemberByClerkId + email-merge), 1 update, 0 inserts.
    expect(calls.selects).toHaveLength(2);
    expect(calls.updates).toHaveLength(1);
    expect(calls.inserts).toHaveLength(0);

    // The merge update sets clerkId on the existing row.
    const set = calls.updates[0].set as Record<string, unknown>;
    expect(set.clerkId).toBe('clerk_new');
    expect(set.updatedAt).toBeInstanceOf(Date);
    // role and feedToken MUST NOT be in the merge set (preserve DB values).
    expect('role' in set).toBe(false);
    expect('feedToken' in set).toBe(false);
  });

  it('SKIPS merge when emailVerified is false (creates separate Clerk row)', async () => {
    // Even if a candidate would match by email, unverified email must NOT merge.
    const candidate = { id: 7, hyloId: 'h-1', clerkId: null, name: 'Alice', email: 'a@x.y' };
    const { db, calls } = makeFakeDb({ candidate });

    await syncClerkMemberWithMerge(db, {
      clerkId: 'clerk_attacker',
      name: 'Mallory',
      email: 'a@x.y',
      image: null,
      emailVerified: false,
    });

    // findMemberByClerkId fires (returns empty), then security gate skips
    // email-merge SELECT, falls straight through to plain syncClerkMember.
    expect(calls.selects).toHaveLength(1);
    // syncClerkMember does 1 insert + 1 update (feedToken backfill).
    expect(calls.inserts).toHaveLength(1);
    expect(calls.updates).toHaveLength(1);

    // The insert is keyed by clerkId, NOT merging into Alice's row.
    const v = calls.inserts[0].values as Record<string, unknown>;
    expect(v.clerkId).toBe('clerk_attacker');
    expect('hyloId' in v).toBe(false);
  });

  it('SKIPS merge when no email is provided', async () => {
    const { db, calls } = makeFakeDb();

    await syncClerkMemberWithMerge(db, {
      clerkId: 'clerk_x',
      name: 'No Email User',
      email: null,
      image: null,
      emailVerified: true,
    });

    // Only findMemberByClerkId fires; no email → no merge SELECT.
    expect(calls.selects).toHaveLength(1);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.updates).toHaveLength(1);
  });

  it('CREATES new Clerk row when verified email has no Hylo-only match', async () => {
    const { db, calls } = makeFakeDb({ candidate: null });

    await syncClerkMemberWithMerge(db, {
      clerkId: 'clerk_brand_new',
      name: 'New User',
      email: 'new@x.y',
      image: null,
      emailVerified: true,
    });

    // Both selects fire (findMemberByClerkId then email-merge); both empty.
    expect(calls.selects).toHaveLength(2);
    // Falls through to plain syncClerkMember insert path.
    expect(calls.inserts).toHaveLength(1);
    expect(calls.updates).toHaveLength(1);
  });

  it('DELEGATES to syncClerkMember when a Member already has this clerkId (returning user, no merge attempt)', async () => {
    // Returning Clerk user — Member row already has this clerkId. Even if a
    // matching Hylo-only email candidate would exist, the wrapper must NOT
    // try to merge (would otherwise hit a unique-violation on clerkId).
    const existing = { id: 5, hyloId: null, clerkId: 'clerk_returning', name: 'X', email: 'x@x.y' };
    const candidate = { id: 7, hyloId: 'h-1', clerkId: null, name: 'Alice', email: 'x@x.y' };
    const { db, calls } = makeFakeDb({ byClerkId: existing, candidate });

    await syncClerkMemberWithMerge(db, {
      clerkId: 'clerk_returning',
      name: 'X (updated)',
      email: 'x@x.y',
      image: null,
      emailVerified: true,
    });

    // First select fires (findMemberByClerkId). Second select MUST NOT fire
    // (we delegated before reaching the merge SELECT).
    expect(calls.selects).toHaveLength(1);
    // Delegated to syncClerkMember → 1 insert + 1 update for feedToken backfill.
    expect(calls.inserts).toHaveLength(1);
    expect(calls.updates).toHaveLength(1);
    // The insert is the upsert keyed by clerkId, NOT a merge UPDATE.
    const v = calls.inserts[0].values as Record<string, unknown>;
    expect(v.clerkId).toBe('clerk_returning');
  });

  it("MERGE preserves candidate's existing name when input.name is missing", async () => {
    const candidate = {
      id: 9,
      hyloId: 'h-9',
      clerkId: null,
      name: 'Original Hylo Name',
      email: 'h@x.y',
      image: 'old.png',
    };
    const { db, calls } = makeFakeDb({ candidate });

    await syncClerkMemberWithMerge(db, {
      clerkId: 'clerk_z',
      name: null,
      email: 'h@x.y',
      image: null,
      emailVerified: true,
    });

    const set = calls.updates[0].set as Record<string, unknown>;
    expect(set.name).toBe('Original Hylo Name'); // fallback to existing
    expect(set.image).toBe('old.png');           // fallback to existing
    expect(set.clerkId).toBe('clerk_z');
  });
});
