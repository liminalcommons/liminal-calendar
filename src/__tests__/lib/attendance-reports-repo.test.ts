/**
 * Repo helpers for attendance reports — upsertReport, getReportForUser,
 * listReportsForEvent, listAllReportsAggregated.
 *
 * Same drizzle-orm mocking pattern as comments-repo.test.ts.
 */

import {
  upsertAttendanceReport,
  getAttendanceReportForUser,
  listAttendanceReportsForEvent,
} from '@/lib/attendance-reports/repo';

interface EqCall {
  columnName: string;
  value: unknown;
}

jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    ...actual,
    eq: (col: { name?: string }, value: unknown) => {
      const g = global as unknown as { __arEqCalls: EqCall[] };
      g.__arEqCalls = g.__arEqCalls ?? [];
      g.__arEqCalls.push({ columnName: col?.name ?? '<anon>', value });
      return actual.eq(col, value);
    },
  };
});

function getEqCalls(): EqCall[] {
  return (global as unknown as { __arEqCalls?: EqCall[] }).__arEqCalls ?? [];
}

function reset() {
  (global as unknown as { __arEqCalls: EqCall[] }).__arEqCalls = [];
}

interface FakeDbCalls {
  insertValues: unknown[];
  updateSets: Array<{ set: unknown }>;
}

function makeFakeDb(returnRows: unknown[]) {
  const calls: FakeDbCalls = {
    insertValues: [],
    updateSets: [],
  };
  const db = {
    insert: () => ({
      values: (v: unknown) => {
        calls.insertValues.push(v);
        return {
          returning: () => Promise.resolve([{ id: 7, ...(v as object) }]),
        };
      },
    }),
    update: () => ({
      set: (s: unknown) => {
        calls.updateSets.push({ set: s });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([
                { id: 7, ...(s as object) },
              ]),
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve(returnRows),
          limit: () => Promise.resolve(returnRows),
        }),
      }),
    }),
  };
  return { db, calls };
}

describe('upsertAttendanceReport', () => {
  beforeEach(reset);

  it('inserts a row when no existing report matches (event, reporter)', async () => {
    const { db, calls } = makeFakeDb([]);
    const result = await upsertAttendanceReport(db, {
      eventId: 5,
      reporterId: 'u-1',
      reporterName: 'Alice',
      eventHappened: true,
      hostPresent: true,
      note: 'great session',
    });
    expect(result.action).toBe('inserted');
    expect(calls.insertValues).toHaveLength(1);
    const inserted = calls.insertValues[0] as Record<string, unknown>;
    expect(inserted.eventId).toBe(5);
    expect(inserted.reporterId).toBe('u-1');
    expect(inserted.eventHappened).toBe(true);
    expect(inserted.hostPresent).toBe(true);
    expect(inserted.note).toBe('great session');
  });

  it('updates the existing row when (event, reporter) already reported', async () => {
    const existing = {
      id: 7,
      eventId: 5,
      reporterId: 'u-1',
      eventHappened: false,
      hostPresent: false,
      note: 'never showed up',
    };
    const { db, calls } = makeFakeDb([existing]);
    const result = await upsertAttendanceReport(db, {
      eventId: 5,
      reporterId: 'u-1',
      reporterName: 'Alice',
      eventHappened: true,
      hostPresent: true,
      note: 'host showed up after delay',
    });
    expect(result.action).toBe('updated');
    expect(calls.insertValues).toHaveLength(0);
    expect(calls.updateSets).toHaveLength(1);
    const updateSet = calls.updateSets[0].set as Record<string, unknown>;
    expect(updateSet.eventHappened).toBe(true);
    expect(updateSet.hostPresent).toBe(true);
    expect(updateSet.note).toBe('host showed up after delay');
  });

  it('queries the existing-row lookup by BOTH event_id AND reporter_id', async () => {
    const { db } = makeFakeDb([]);
    await upsertAttendanceReport(db, {
      eventId: 42,
      reporterId: 'u-X',
      reporterName: 'X',
      eventHappened: true,
      hostPresent: false,
      note: null,
    });
    const cols = getEqCalls().map((c) => c.columnName);
    expect(cols).toContain('event_id');
    expect(cols).toContain('reporter_id');
  });

  it('truncates note longer than 1000 characters', async () => {
    const { db, calls } = makeFakeDb([]);
    const longNote = 'x'.repeat(1500);
    await upsertAttendanceReport(db, {
      eventId: 1,
      reporterId: 'u',
      reporterName: 'U',
      eventHappened: true,
      hostPresent: true,
      note: longNote,
    });
    const inserted = calls.insertValues[0] as Record<string, unknown>;
    expect((inserted.note as string).length).toBe(1000);
  });
});

describe('getAttendanceReportForUser', () => {
  beforeEach(reset);

  it('returns the row matching (event_id, reporter_id), undefined if none', async () => {
    const row = {
      id: 7,
      eventId: 5,
      reporterId: 'u-1',
      eventHappened: true,
      hostPresent: true,
      note: null,
    };
    const { db } = makeFakeDb([row]);
    const result = await getAttendanceReportForUser(db, 5, 'u-1');
    expect(result).toEqual(row);
    const cols = getEqCalls().map((c) => c.columnName);
    expect(cols).toContain('event_id');
    expect(cols).toContain('reporter_id');
  });

  it('returns undefined when no row matches', async () => {
    const { db } = makeFakeDb([]);
    const result = await getAttendanceReportForUser(db, 5, 'nobody');
    expect(result).toBeUndefined();
  });
});

describe('listAttendanceReportsForEvent', () => {
  beforeEach(reset);

  it('returns all rows for the given event_id', async () => {
    const rows = [
      { id: 1, eventId: 5, reporterId: 'a', eventHappened: true, hostPresent: true },
      { id: 2, eventId: 5, reporterId: 'b', eventHappened: true, hostPresent: false },
    ];
    const { db } = makeFakeDb(rows);
    const result = await listAttendanceReportsForEvent(db, 5);
    expect(result).toEqual(rows);
    const cols = getEqCalls().map((c) => c.columnName);
    expect(cols).toContain('event_id');
  });
});
