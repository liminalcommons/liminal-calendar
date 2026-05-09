/**
 * Invitations repo — setEventInvitations + listEventInvitations.
 *
 * Mocks @/lib/db so db.transaction is fully controllable. The transaction
 * callback receives a fake tx with .delete(), .insert(), .select() chains
 * that record calls without touching a real database.
 */

import { setEventInvitations, listEventInvitations, INVITEE_CAP_MEMBER } from '@/lib/events/invitations-repo';

// ── Fake transaction machinery ────────────────────────────────────────────────

interface TxCalls {
  deleteWheres: unknown[];
  insertValues: unknown[];
  selectRows: unknown[];
}

function makeTx(selectRows: unknown[] = []): { tx: object; calls: TxCalls } {
  const calls: TxCalls = { deleteWheres: [], insertValues: [], selectRows };

  const tx = {
    delete: (_table: unknown) => ({
      where: (cond: unknown) => {
        calls.deleteWheres.push(cond);
        return Promise.resolve();
      },
    }),
    insert: (_table: unknown) => ({
      values: (rows: unknown) => {
        calls.insertValues.push(rows);
        return Promise.resolve();
      },
    }),
    select: (_proj?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          orderBy: (_col: unknown) => Promise.resolve(selectRows),
        }),
      }),
    }),
  };

  return { tx, calls };
}

// ── Mock @/lib/db ─────────────────────────────────────────────────────────────

let _txCallback: ((tx: object) => Promise<void>) | null = null;
let _txCalls: TxCalls = { deleteWheres: [], insertValues: [], selectRows: [] };
let _selectRows: unknown[] = [];

jest.mock('@/lib/db', () => ({
  db: {
    transaction: async (cb: (tx: object) => Promise<void>) => {
      const { tx, calls } = makeTx(_selectRows);
      _txCalls = calls;
      _txCallback = cb;
      await cb(tx);
    },
    select: (_proj?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          orderBy: (_col: unknown) => Promise.resolve(_selectRows),
        }),
      }),
    }),
  },
}));

function resetMock(selectRows: unknown[] = []) {
  _selectRows = selectRows;
  _txCalls = { deleteWheres: [], insertValues: [], selectRows };
  _txCallback = null;
}

// ── Helper to build invitees ──────────────────────────────────────────────────

function makeInvitees(count: number, prefix = 'u') {
  return Array.from({ length: count }, (_, i) => ({
    userId: `${prefix}-${i}`,
    name: `User ${i}`,
    image: null,
  }));
}

// ── setEventInvitations ───────────────────────────────────────────────────────

describe('INVITEE_CAP_MEMBER', () => {
  it('is exported and equals 10', () => {
    expect(INVITEE_CAP_MEMBER).toBe(10);
  });
});

describe('setEventInvitations', () => {
  beforeEach(() => resetMock());

  it('throws INVITEE_CAP_EXCEEDED when member organizer has 11 unique invitees', async () => {
    await expect(
      setEventInvitations({
        eventId: 1,
        organizerRole: 'member',
        invitees: makeInvitees(11),
      }),
    ).rejects.toThrow('INVITEE_CAP_EXCEEDED');
  });

  it('succeeds when member organizer has exactly 10 unique invitees — issues 1 DELETE + 1 INSERT', async () => {
    await setEventInvitations({
      eventId: 1,
      organizerRole: 'member',
      invitees: makeInvitees(10),
    });
    expect(_txCalls.deleteWheres).toHaveLength(1);
    expect(_txCalls.insertValues).toHaveLength(1);
    const rows = _txCalls.insertValues[0] as unknown[];
    expect(rows).toHaveLength(10);
  });

  it('succeeds for host organizer with 100 invitees (no cap)', async () => {
    await setEventInvitations({
      eventId: 2,
      organizerRole: 'host',
      invitees: makeInvitees(100),
    });
    const rows = _txCalls.insertValues[0] as unknown[];
    expect(rows).toHaveLength(100);
  });

  it('succeeds for admin organizer with 50 invitees (no cap)', async () => {
    await setEventInvitations({
      eventId: 3,
      organizerRole: 'admin',
      invitees: makeInvitees(50),
    });
    const rows = _txCalls.insertValues[0] as unknown[];
    expect(rows).toHaveLength(50);
  });

  it('dedupes by userId so 12 entries with 10 unique IDs succeeds for member', async () => {
    // 10 unique users, 2 duplicates (last-wins)
    const base = makeInvitees(10);
    const dupes = [
      { userId: 'u-0', name: 'User 0 updated', image: null },
      { userId: 'u-1', name: 'User 1 updated', image: null },
    ];
    await setEventInvitations({
      eventId: 4,
      organizerRole: 'member',
      invitees: [...base, ...dupes],
    });
    const rows = _txCalls.insertValues[0] as Array<{ inviteeName: string }>;
    expect(rows).toHaveLength(10);
    // last-wins: names should be the updated versions
    const names = rows.map((r) => r.inviteeName);
    expect(names).toContain('User 0 updated');
    expect(names).toContain('User 1 updated');
  });

  it('runs DELETE but no INSERT when invitees array is empty', async () => {
    await setEventInvitations({
      eventId: 5,
      organizerRole: 'member',
      invitees: [],
    });
    expect(_txCalls.deleteWheres).toHaveLength(1);
    expect(_txCalls.insertValues).toHaveLength(0);
  });
});

// ── listEventInvitations ──────────────────────────────────────────────────────

describe('listEventInvitations', () => {
  it('returns rows ordered by invitedAt ASC', async () => {
    const t1 = new Date('2026-01-01T10:00:00Z');
    const t2 = new Date('2026-01-02T10:00:00Z');
    const rows = [
      { inviteeUserId: 'u-a', inviteeName: 'Alice', inviteeImage: null as string | null, invitedAt: t1 as Date | null },
      { inviteeUserId: 'u-b', inviteeName: 'Bob', inviteeImage: 'bob.png' as string | null, invitedAt: t2 as Date | null },
    ];
    resetMock(rows);

    const result = await listEventInvitations(42);
    expect(result).toHaveLength(2);
    expect(result[0].inviteeUserId).toBe('u-a');
    expect(result[1].inviteeUserId).toBe('u-b');
    expect(result[0].invitedAt).toEqual(t1);
  });
});
