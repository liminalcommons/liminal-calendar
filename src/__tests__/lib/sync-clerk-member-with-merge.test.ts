import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';

interface Calls {
  selects: Array<{ where: unknown; limit: unknown }>;
  updates: Array<{ set: unknown; where: unknown }>;
  inserts: Array<{ values: unknown; conflictTarget: unknown; conflictSet: unknown }>;
}

function makeFakeDb(opts: { candidate?: Record<string, unknown> | null } = {}) {
  const candidate = opts.candidate ?? null;
  const calls: Calls = { selects: [], updates: [], inserts: [] };

  const db = {
    select: () => ({
      from: () => ({
        where: (predicate: unknown) => ({
          limit: (n: unknown) => {
            calls.selects.push({ where: predicate, limit: n });
            return Promise.resolve(candidate ? [candidate] : []);
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

    // MERGE path: 1 select, 1 update, 0 inserts.
    expect(calls.selects).toHaveLength(1);
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

    // No merge select should happen — straight to plain syncClerkMember.
    expect(calls.selects).toHaveLength(0);
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

    expect(calls.selects).toHaveLength(0);
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

    // Merge SELECT happened (verified email warrants the lookup) but found nothing.
    expect(calls.selects).toHaveLength(1);
    // Falls through to plain syncClerkMember insert path.
    expect(calls.inserts).toHaveLength(1);
    expect(calls.updates).toHaveLength(1);
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
