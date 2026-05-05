/**
 * Inbox repo helpers — createNotification, listNotificationsForUser,
 * markAllSeen, countUnseen.
 *
 * Same drizzle-orm mocking pattern as comments-repo.test.ts and
 * attendance-reports-repo.test.ts.
 */

import {
  createNotification,
  listNotificationsForUser,
  markAllSeen,
  countUnseen,
} from '@/lib/notifications/inbox/repo';

interface EqCall {
  columnName: string;
  value: unknown;
}

jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    ...actual,
    eq: (col: { name?: string }, value: unknown) => {
      const g = global as unknown as { __nbEqCalls: EqCall[] };
      g.__nbEqCalls = g.__nbEqCalls ?? [];
      g.__nbEqCalls.push({ columnName: col?.name ?? '<anon>', value });
      return actual.eq(col, value);
    },
    isNull: (col: { name?: string }) => {
      const g = global as unknown as { __nbIsNullCalls: string[] };
      g.__nbIsNullCalls = g.__nbIsNullCalls ?? [];
      g.__nbIsNullCalls.push(col?.name ?? '<anon>');
      return actual.isNull(col);
    },
  };
});

function getEqCalls(): EqCall[] {
  return (global as unknown as { __nbEqCalls?: EqCall[] }).__nbEqCalls ?? [];
}
function getIsNullCols(): string[] {
  return (global as unknown as { __nbIsNullCalls?: string[] }).__nbIsNullCalls ?? [];
}
function reset() {
  (global as unknown as { __nbEqCalls: EqCall[] }).__nbEqCalls = [];
  (global as unknown as { __nbIsNullCalls: string[] }).__nbIsNullCalls = [];
}

interface FakeDbCalls {
  insertValues: unknown[];
  updateSets: unknown[];
  selectLimits: number[];
}

function makeFakeDb(returnRows: unknown[]) {
  const calls: FakeDbCalls = {
    insertValues: [],
    updateSets: [],
    selectLimits: [],
  };
  const db = {
    insert: () => ({
      values: (v: unknown) => {
        calls.insertValues.push(v);
        return {
          returning: () => Promise.resolve([{ id: 99, ...(v as object) }]),
        };
      },
    }),
    update: () => ({
      set: (s: unknown) => {
        calls.updateSets.push(s);
        return {
          where: () => ({
            returning: () => Promise.resolve(returnRows),
          }),
        };
      },
    }),
    select: (_proj?: unknown) => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: (n: number) => {
              calls.selectLimits.push(n);
              return Promise.resolve(returnRows);
            },
          }),
          // For countUnseen — terminates after .where()
          then: (resolve: (v: unknown) => void) => resolve(returnRows),
        }),
      }),
    }),
  };
  return { db, calls };
}

describe('createNotification', () => {
  beforeEach(reset);

  it('inserts a row with all required fields', async () => {
    const { db, calls } = makeFakeDb([]);
    await createNotification(db, {
      userId: 'u-1',
      type: 'reminder.1hr',
      eventId: 5,
      title: 'Coffee House — in 1 hour',
      url: '/events/5',
    });
    expect(calls.insertValues).toHaveLength(1);
    const v = calls.insertValues[0] as Record<string, unknown>;
    expect(v.userId).toBe('u-1');
    expect(v.type).toBe('reminder.1hr');
    expect(v.eventId).toBe(5);
    expect(v.title).toBe('Coffee House — in 1 hour');
    expect(v.url).toBe('/events/5');
  });

  it('defaults optional fields to null', async () => {
    const { db, calls } = makeFakeDb([]);
    await createNotification(db, {
      userId: 'u-1',
      type: 'event.cancelled',
      title: 'X',
      url: '/x',
    });
    const v = calls.insertValues[0] as Record<string, unknown>;
    expect(v.eventId).toBeNull();
    expect(v.actorId).toBeNull();
    expect(v.actorName).toBeNull();
    expect(v.body).toBeNull();
    expect(v.payload).toBeNull();
  });

  it('passes through actor + payload when provided', async () => {
    const { db, calls } = makeFakeDb([]);
    await createNotification(db, {
      userId: 'u-1',
      type: 'event.changed',
      eventId: 7,
      actorId: 'actor-x',
      actorName: 'Bob',
      title: 'Yoga — details updated',
      body: 'Time changed',
      url: '/events/7',
      payload: { changedFields: ['startsAt', 'location'] },
    });
    const v = calls.insertValues[0] as Record<string, unknown>;
    expect(v.actorId).toBe('actor-x');
    expect(v.actorName).toBe('Bob');
    expect(v.payload).toEqual({ changedFields: ['startsAt', 'location'] });
  });
});

describe('listNotificationsForUser', () => {
  beforeEach(reset);

  it('defaults to 20 results, ordered by created_at desc, scoped to user_id', async () => {
    const { db, calls } = makeFakeDb([{ id: 1 }, { id: 2 }]);
    const out = await listNotificationsForUser(db, 'u-1');
    expect(out).toHaveLength(2);
    expect(calls.selectLimits).toEqual([20]);
    const cols = getEqCalls().map((c) => c.columnName);
    expect(cols).toContain('user_id');
  });

  it('honors a custom limit, clamped to MAX_LIMIT (100)', async () => {
    const { db, calls } = makeFakeDb([]);
    await listNotificationsForUser(db, 'u-1', { limit: 9999 });
    expect(calls.selectLimits).toEqual([100]);
  });

  it('floors a sub-1 limit to 1', async () => {
    const { db, calls } = makeFakeDb([]);
    await listNotificationsForUser(db, 'u-1', { limit: 0 });
    expect(calls.selectLimits).toEqual([1]);
  });

  it('adds isNull(seen_at) predicate when unseenOnly is true', async () => {
    const { db } = makeFakeDb([]);
    await listNotificationsForUser(db, 'u-1', { unseenOnly: true });
    expect(getIsNullCols()).toContain('seen_at');
  });

  it('does NOT add isNull predicate by default', async () => {
    const { db } = makeFakeDb([]);
    await listNotificationsForUser(db, 'u-1');
    expect(getIsNullCols()).not.toContain('seen_at');
  });
});

describe('markAllSeen', () => {
  beforeEach(reset);

  it('updates only unseen rows for the given user, returns count', async () => {
    const { db, calls } = makeFakeDb([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const n = await markAllSeen(db, 'u-1');
    expect(n).toBe(3);
    expect(calls.updateSets).toHaveLength(1);
    const setArg = calls.updateSets[0] as Record<string, unknown>;
    expect(setArg.seenAt).toBeInstanceOf(Date);
    expect(getEqCalls().some((c) => c.columnName === 'user_id' && c.value === 'u-1')).toBe(true);
    expect(getIsNullCols()).toContain('seen_at');
  });

  it('returns 0 when nothing to mark', async () => {
    const { db } = makeFakeDb([]);
    const n = await markAllSeen(db, 'u-1');
    expect(n).toBe(0);
  });
});

describe('countUnseen', () => {
  beforeEach(reset);

  it('returns the integer count of unseen rows for the user', async () => {
    const { db } = makeFakeDb([{ count: 7 }]);
    const n = await countUnseen(db, 'u-1');
    expect(n).toBe(7);
    expect(getEqCalls().some((c) => c.columnName === 'user_id' && c.value === 'u-1')).toBe(true);
    expect(getIsNullCols()).toContain('seen_at');
  });

  it('returns 0 when no unseen rows', async () => {
    const { db } = makeFakeDb([{ count: 0 }]);
    const n = await countUnseen(db, 'u-1');
    expect(n).toBe(0);
  });

  it('returns 0 when query result is empty', async () => {
    const { db } = makeFakeDb([]);
    const n = await countUnseen(db, 'u-1');
    expect(n).toBe(0);
  });
});
