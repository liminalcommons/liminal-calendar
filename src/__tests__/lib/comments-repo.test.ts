/**
 * Repo helpers for event comments — covers createComment, listComments,
 * softDeleteComment, getComment.
 *
 * The helpers use Drizzle; we mock drizzle-orm so we can observe the eq()
 * column names without evaluating SQL ASTs (same pattern as rsvp-upsert.test.ts).
 */

import {
  createComment,
  listComments,
  softDeleteComment,
  getComment,
} from '@/lib/comments/repo';

interface EqCall {
  columnName: string;
  value: unknown;
}

jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    ...actual,
    eq: (col: { name?: string }, value: unknown) => {
      const g = global as unknown as { __commentsEqCalls: EqCall[] };
      g.__commentsEqCalls = g.__commentsEqCalls ?? [];
      g.__commentsEqCalls.push({ columnName: col?.name ?? '<anon>', value });
      return actual.eq(col, value);
    },
    isNull: (col: { name?: string }) => {
      const g = global as unknown as { __commentsIsNullCalls: string[] };
      g.__commentsIsNullCalls = g.__commentsIsNullCalls ?? [];
      g.__commentsIsNullCalls.push(col?.name ?? '<anon>');
      return actual.isNull(col);
    },
  };
});

function getEqCalls(): EqCall[] {
  return (global as unknown as { __commentsEqCalls?: EqCall[] }).__commentsEqCalls ?? [];
}

function getIsNullCalls(): string[] {
  return (global as unknown as { __commentsIsNullCalls?: string[] }).__commentsIsNullCalls ?? [];
}

function reset() {
  (global as unknown as { __commentsEqCalls: EqCall[] }).__commentsEqCalls = [];
  (global as unknown as { __commentsIsNullCalls: string[] }).__commentsIsNullCalls = [];
}

interface FakeDbCalls {
  insertValues: unknown[];
  updateSets: Array<{ set: unknown; whereArg: unknown }>;
  selectFromCalls: number;
  orderByCalls: unknown[];
}

function makeFakeDb(returnRows: unknown[]) {
  const calls: FakeDbCalls = {
    insertValues: [],
    updateSets: [],
    selectFromCalls: 0,
    orderByCalls: [],
  };
  const insertChain = {
    values: (v: unknown) => {
      calls.insertValues.push(v);
      return {
        returning: () => Promise.resolve([{ id: 123, ...(v as object) }]),
      };
    },
  };
  const updateChain = {
    set: (s: unknown) => ({
      where: (cond: unknown) => {
        calls.updateSets.push({ set: s, whereArg: cond });
        return Promise.resolve();
      },
    }),
  };
  const whereChain = {
    orderBy: (o: unknown) => {
      calls.orderByCalls.push(o);
      return Promise.resolve(returnRows);
    },
    limit: () => Promise.resolve(returnRows),
  };
  const fromChain = {
    where: () => whereChain,
  };
  const selectChain = {
    from: () => {
      calls.selectFromCalls += 1;
      return fromChain;
    },
  };
  const db = {
    insert: () => insertChain,
    update: () => updateChain,
    select: () => selectChain,
  };
  return { db, calls };
}

describe('createComment', () => {
  beforeEach(reset);

  it('inserts the comment with the given fields and returns the row', async () => {
    const { db, calls } = makeFakeDb([]);
    const result = await createComment(db, {
      eventId: 42,
      authorId: 'u-1',
      authorName: 'Alice',
      authorImage: 'avatar.png',
      body: 'looking forward to this',
    });

    expect(calls.insertValues).toHaveLength(1);
    expect(calls.insertValues[0]).toEqual({
      eventId: 42,
      authorId: 'u-1',
      authorName: 'Alice',
      authorImage: 'avatar.png',
      body: 'looking forward to this',
    });
    expect(result.id).toBe(123);
    expect(result.body).toBe('looking forward to this');
  });

  it('trims the body and rejects empty strings', async () => {
    const { db } = makeFakeDb([]);
    await expect(
      createComment(db, {
        eventId: 1,
        authorId: 'u',
        authorName: 'U',
        authorImage: null,
        body: '   ',
      }),
    ).rejects.toThrow(/empty/i);
  });

  it('rejects bodies longer than 2000 characters', async () => {
    const { db } = makeFakeDb([]);
    await expect(
      createComment(db, {
        eventId: 1,
        authorId: 'u',
        authorName: 'U',
        authorImage: null,
        body: 'x'.repeat(2001),
      }),
    ).rejects.toThrow(/2000/);
  });
});

describe('listComments', () => {
  beforeEach(reset);

  it('queries by event_id AND deleted_at IS NULL, ordered by created_at', async () => {
    const rows = [{ id: 1, eventId: 7, body: 'hi' }];
    const { db } = makeFakeDb(rows);
    const result = await listComments(db, 7);

    expect(result).toEqual(rows);
    const eqCols = getEqCalls().map((c) => c.columnName);
    expect(eqCols).toContain('event_id');
    expect(getIsNullCalls()).toContain('deleted_at');
  });
});

describe('softDeleteComment', () => {
  beforeEach(reset);

  it('sets deleted_at on the row matching id', async () => {
    const { db, calls } = makeFakeDb([]);
    await softDeleteComment(db, 99);
    expect(calls.updateSets).toHaveLength(1);
    const set = calls.updateSets[0].set as Record<string, unknown>;
    expect(set.deletedAt).toBeInstanceOf(Date);
    const eqCols = getEqCalls().map((c) => c.columnName);
    expect(eqCols).toContain('id');
  });
});

describe('getComment', () => {
  beforeEach(reset);

  it('returns the row matching id, or undefined', async () => {
    const row = { id: 5, eventId: 1, authorId: 'u', body: 'hi' };
    const { db } = makeFakeDb([row]);
    const result = await getComment(db, 5);
    expect(result).toEqual(row);
    const eqCols = getEqCalls().map((c) => c.columnName);
    expect(eqCols).toContain('id');
  });

  it('returns undefined when no row matches', async () => {
    const { db } = makeFakeDb([]);
    const result = await getComment(db, 5);
    expect(result).toBeUndefined();
  });
});
