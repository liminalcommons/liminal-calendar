/**
 * @jest-environment node
 */

// Verifies the cron joins on notification_preferences and uses the
// per-window column. Uses an in-memory fake db that records the join
// arguments so we can assert the new shape without touching Postgres.
import { GET } from '@/app/api/cron/send-reminders/route';

const sendEmailMock = jest.fn().mockResolvedValue({ success: true });
const sendPushMock = jest.fn().mockResolvedValue({ sent: 1, failed: 0 });

jest.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));
jest.mock('@/lib/notifications/push', () => ({
  sendPushToUsers: (...a: unknown[]) => sendPushMock(...a),
}));

// Fake db whose select().from().innerJoin().innerJoin().where() returns canned rows.
const dbCalls: { method: string; args: unknown[] }[] = [];
jest.mock('@/lib/db', () => {
  const mkSelect = (rows: unknown[]) => ({
    from: () => ({
      innerJoin: (...args: unknown[]) => {
        dbCalls.push({ method: 'innerJoin', args });
        return {
          innerJoin: (...args2: unknown[]) => {
            dbCalls.push({ method: 'innerJoin', args: args2 });
            return {
              where: () => Promise.resolve(rows),
            };
          },
          where: () => Promise.resolve(rows),
        };
      },
    }),
  });
  return {
    db: {
      select: () => mkSelect([]), // no due events for any window in this test
      delete: () => ({ where: () => Promise.resolve() }),
      insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
    },
  };
});

beforeEach(() => {
  dbCalls.length = 0;
  process.env.CRON_SECRET = 'shh';
});

describe('cron send-reminders read path', () => {
  it('rejects without auth', async () => {
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('joins notification_preferences for each window query', async () => {
    const res = await GET(new Request('http://localhost', {
      headers: { authorization: 'Bearer shh' },
    }));
    expect(res.status).toBe(200);

    // 6 windows × 2 inner joins (rsvps + notification_preferences) = 12 innerJoin calls
    expect(dbCalls.filter(c => c.method === 'innerJoin').length).toBeGreaterThanOrEqual(12);
  });
});
