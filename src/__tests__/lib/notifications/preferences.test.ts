import { WINDOW_TO_COLUMN, type NotificationChannelHorizon } from '@/lib/notifications/preferences';

describe('WINDOW_TO_COLUMN', () => {
  it('maps every cron window string to a notification_preferences column', () => {
    expect(WINDOW_TO_COLUMN['push-1hr']).toBe('pushOneHour');
    expect(WINDOW_TO_COLUMN['push-15min']).toBe('pushFifteenMin');
    expect(WINDOW_TO_COLUMN['push-start']).toBe('pushAtStart');
    expect(WINDOW_TO_COLUMN['24hr']).toBe('emailTwentyFourHour');
    expect(WINDOW_TO_COLUMN['1hr']).toBe('emailOneHour');
    expect(WINDOW_TO_COLUMN['15min']).toBe('emailFifteenMin');
  });

  it('has exactly six entries (no drift)', () => {
    expect(Object.keys(WINDOW_TO_COLUMN)).toHaveLength(6);
  });
});

describe('ensurePreferences (fake db)', () => {
  function makeFakeDb() {
    const inserts: unknown[] = [];
    const selects: unknown[] = [];
    let selectResult: unknown[] = [];
    const db = {
      insert: () => ({
        values: (v: unknown) => ({
          onConflictDoNothing: () => {
            inserts.push(v);
            return Promise.resolve();
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: (w: unknown) => {
            selects.push(w);
            return Promise.resolve(selectResult);
          },
        }),
      }),
      __setSelectResult(rows: unknown[]) { selectResult = rows; },
    };
    return { db, inserts, selects };
  }

  it('inserts with onConflictDoNothing then returns the existing row', async () => {
    const { ensurePreferences } = await import('@/lib/notifications/preferences');
    const { db, inserts } = makeFakeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).__setSelectResult([{ userId: 'u1', pushOneHour: true }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await ensurePreferences(db as any, 'u1');
    expect(inserts).toEqual([{ userId: 'u1' }]);
    expect(result?.userId).toBe('u1');
  });
});

// Suppresses TS unused-var warning for the type-only import in this file.
const _t: NotificationChannelHorizon | undefined = undefined;
void _t;
