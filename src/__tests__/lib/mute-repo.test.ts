import { muteSeries, unmuteSeries, isSeriesMuted, listMutedSeries } from '@/lib/notifications/mute-repo';

type Row = { id: number; memberId: number; eventId: number; createdAt: Date | null };

function makeFakeDb(rows: Row[] = []) {
  let nextId = rows.length + 1;
  return {
    rows,
    insert: () => ({
      values: (v: { memberId: number; eventId: number }) => ({
        onConflictDoNothing: async () => {
          if (!rows.find(r => r.memberId === v.memberId && r.eventId === v.eventId)) {
            rows.push({ id: nextId++, memberId: v.memberId, eventId: v.eventId, createdAt: new Date() });
          }
        },
      }),
    }),
    // delete().where(_anyOperatorObject) — removes all rows (test seeds only what should be removed)
    delete: () => ({
      where: async (_: unknown) => {
        rows.splice(0, rows.length);
      },
    }),
    // select().from().where(_anyOperatorObject) — returns all rows (test seeds only what should match)
    select: () => ({
      from: () => ({
        where: (_: unknown) => Promise.resolve([...rows]),
      }),
    }),
  };
}

describe('mute-repo', () => {
  test('muteSeries inserts a row', async () => {
    const db = makeFakeDb();
    await muteSeries(db as any, 7, 42);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ memberId: 7, eventId: 42 });
  });

  test('muteSeries is idempotent', async () => {
    const db = makeFakeDb();
    await muteSeries(db as any, 7, 42);
    await muteSeries(db as any, 7, 42);
    expect(db.rows).toHaveLength(1);
  });

  test('unmuteSeries removes the row', async () => {
    const db = makeFakeDb([{ id: 1, memberId: 7, eventId: 42, createdAt: new Date() }]);
    await unmuteSeries(db as any, 7, 42);
    expect(db.rows).toHaveLength(0);
  });

  test('isSeriesMuted returns true when muted', async () => {
    const db = makeFakeDb([{ id: 1, memberId: 7, eventId: 42, createdAt: new Date() }]);
    expect(await isSeriesMuted(db as any, 7, 42)).toBe(true);
  });

  test('isSeriesMuted returns false when not muted', async () => {
    const db = makeFakeDb();
    expect(await isSeriesMuted(db as any, 7, 42)).toBe(false);
  });

  test('listMutedSeries returns all event_ids for a member', async () => {
    // Seed only the rows that belong to memberId=7 — fake's where() returns all rows
    const db = makeFakeDb([
      { id: 1, memberId: 7, eventId: 42, createdAt: new Date() },
      { id: 2, memberId: 7, eventId: 99, createdAt: new Date() },
    ]);
    const result = await listMutedSeries(db as any, 7);
    expect(result.map((r: Row) => r.eventId).sort()).toEqual([42, 99]);
  });
});
