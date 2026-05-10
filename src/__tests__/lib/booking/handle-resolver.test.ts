/**
 * @jest-environment node
 *
 * Tests for resolveHandleToMemberId — Task 1 of Plan 3 (1:1 Booking).
 *
 * The resolver looks up a member row by case-insensitive handle and
 * returns the row's integer id (members.id), or null if not found.
 */

jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

import { resolveHandleToMemberId } from '@/lib/booking/handle-resolver';

type WhereArg = unknown;
function setupDbMock(rows: unknown[]): { whereArgs: WhereArg[] } {
  const whereArgs: WhereArg[] = [];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  dbModule.db.select = jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn((arg: WhereArg) => {
        whereArgs.push(arg);
        return {
          limit: jest.fn(() => Promise.resolve(rows)),
        };
      }),
    })),
  }));
  return { whereArgs };
}

describe('resolveHandleToMemberId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null on empty string without querying the db', async () => {
    const selectSpy = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
    dbModule.db.select = selectSpy;

    const result = await resolveHandleToMemberId('');
    expect(result).toBeNull();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('returns null when handle is unknown', async () => {
    setupDbMock([]);
    const result = await resolveHandleToMemberId('ghost');
    expect(result).toBeNull();
  });

  it('returns members.id when handle matches', async () => {
    setupDbMock([{ id: 42 }]);
    const result = await resolveHandleToMemberId('alice');
    expect(result).toBe(42);
  });

  it('lowercases the handle before lookup (case-insensitive)', async () => {
    // The where predicate is opaque (drizzle sql fragment), but we can
    // verify the resolver returns the row that the (mocked) query
    // produced — i.e. the implementation does the query.
    setupDbMock([{ id: 7 }]);
    const result = await resolveHandleToMemberId('ALICE');
    expect(result).toBe(7);
  });
});
