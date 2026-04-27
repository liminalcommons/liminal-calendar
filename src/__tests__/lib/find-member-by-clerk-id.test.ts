import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';

function makeFakeDb(rowToReturn: unknown[] = []) {
  const calls: { from?: unknown; where?: unknown; limit?: unknown } = {};
  const db = {
    select: () => ({
      from: (table: unknown) => {
        calls.from = table;
        return {
          where: (predicate: unknown) => {
            calls.where = predicate;
            return {
              limit: (n: unknown) => {
                calls.limit = n;
                return Promise.resolve(rowToReturn);
              },
            };
          },
        };
      },
    }),
  };
  return { db, calls };
}

describe('findMemberByClerkId', () => {
  it('returns the matching member when one exists', async () => {
    const member = {
      id: 1,
      hyloId: null,
      clerkId: 'clerk_user_xyz',
      name: 'Alice',
      email: 'a@x.y',
      role: 'member',
    };
    const { db } = makeFakeDb([member]);
    const result = await findMemberByClerkId(db, 'clerk_user_xyz');
    expect(result).toBe(member);
  });

  it('returns undefined when no matching member exists', async () => {
    const { db } = makeFakeDb([]);
    const result = await findMemberByClerkId(db, 'clerk_unknown');
    expect(result).toBeUndefined();
  });

  it('issues a select with limit(1)', async () => {
    const { db, calls } = makeFakeDb([]);
    await findMemberByClerkId(db, 'clerk_x');
    expect(calls.from).toBeDefined();
    expect(calls.where).toBeDefined();
    expect(calls.limit).toBe(1);
  });
});
