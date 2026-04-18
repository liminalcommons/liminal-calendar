/**
 * Regression test for the RSVP upsert fix (commit 307ae41).
 *
 * The bug: the "existing RSVP" lookup filtered by eventId only, so when any
 * OTHER user had RSVP'd to an event, a new user's click-to-RSVP would
 * silently update that other user's row. This test locks in the fix by
 * asserting the existence lookup queries on BOTH event_id AND user_id.
 */

import { upsertRsvp } from '@/lib/rsvp/upsert';

interface EqCall {
  columnName: string;
  value: unknown;
}

// Monkey-patch drizzle-orm so we can observe the eq() calls issued by
// upsertRsvp without having to evaluate drizzle's SQL AST manually.
jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    ...actual,
    eq: (col: { name?: string }, value: unknown) => {
      const globalAny = global as unknown as { __rsvpEqCalls: EqCall[] };
      globalAny.__rsvpEqCalls = globalAny.__rsvpEqCalls ?? [];
      globalAny.__rsvpEqCalls.push({ columnName: col?.name ?? '<anon>', value });
      return actual.eq(col, value);
    },
  };
});

function getEqCalls(): EqCall[] {
  return (global as unknown as { __rsvpEqCalls?: EqCall[] }).__rsvpEqCalls ?? [];
}

function resetEqCalls() {
  (global as unknown as { __rsvpEqCalls: EqCall[] }).__rsvpEqCalls = [];
}

// Minimal fake db: records select/insert/update calls. The `where` stage
// returns the caller-supplied `existingRows` verbatim so tests can drive
// both branches (INSERT vs UPDATE) deterministically.
function makeFakeDb(existingRows: unknown[]) {
  const insertValues: unknown[] = [];
  const updateSets: Array<{ set: unknown; whereArg: unknown }> = [];

  const db = {
    select: () => ({
      from: () => ({
        where: (_cond: unknown) => Promise.resolve(existingRows),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        insertValues.push(v);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (s: unknown) => ({
        where: (cond: unknown) => {
          updateSets.push({ set: s, whereArg: cond });
          return Promise.resolve();
        },
      }),
    }),
  };

  return { db, insertValues, updateSets };
}

describe('upsertRsvp', () => {
  beforeEach(() => {
    resetEqCalls();
  });

  it('queries the existing-row lookup by BOTH event_id AND user_id', async () => {
    const { db } = makeFakeDb([]);
    await upsertRsvp(db, {
      eventId: 42,
      userId: 'user-B',
      userName: 'Bob',
      userImage: null,
      status: 'yes',
    });

    const calls = getEqCalls();
    // The first two eq() calls are inside the `and(...)` of the select-where.
    // Both must be present; if someone regresses to event_id-only, this fails.
    const cols = calls.map((c) => c.columnName);
    expect(cols).toContain('event_id');
    expect(cols).toContain('user_id');
    const userIdCall = calls.find((c) => c.columnName === 'user_id');
    expect(userIdCall?.value).toBe('user-B');
  });

  it('INSERTS a new row when no existing RSVP matches the (event, user) pair', async () => {
    const { db, insertValues, updateSets } = makeFakeDb([]);
    const result = await upsertRsvp(db, {
      eventId: 42,
      userId: 'user-B',
      userName: 'Bob',
      userImage: null,
      status: 'yes',
    });

    expect(result.action).toBe('inserted');
    expect(updateSets).toHaveLength(0);
    expect(insertValues).toHaveLength(1);
    expect(insertValues[0]).toEqual({
      eventId: 42,
      userId: 'user-B',
      userName: 'Bob',
      userImage: null,
      status: 'yes',
      remindMe: false,
    });
  });

  it('UPDATES the existing row when a matching (event, user) row is returned', async () => {
    const existing = { id: 999, eventId: 42, userId: 'user-B', status: 'interested' };
    const { db, insertValues, updateSets } = makeFakeDb([existing]);
    const result = await upsertRsvp(db, {
      eventId: 42,
      userId: 'user-B',
      userName: 'Bob',
      userImage: 'img.png',
      status: 'yes',
      remindMe: true,
    });

    expect(result).toEqual({ action: 'updated', rsvpId: 999 });
    expect(insertValues).toHaveLength(0);
    expect(updateSets).toHaveLength(1);
    expect(updateSets[0].set).toEqual({
      status: 'yes',
      userName: 'Bob',
      userImage: 'img.png',
      remindMe: true,
    });
  });

  it('omits remindMe from the update set when it is undefined (preserves existing value)', async () => {
    const existing = { id: 7, eventId: 1, userId: 'u', status: 'yes' };
    const { db, updateSets } = makeFakeDb([existing]);
    await upsertRsvp(db, {
      eventId: 1,
      userId: 'u',
      userName: 'U',
      userImage: null,
      status: 'no',
      // remindMe omitted
    });

    const setObj = updateSets[0].set as Record<string, unknown>;
    expect('remindMe' in setObj).toBe(false);
    expect(setObj.status).toBe('no');
  });
});
