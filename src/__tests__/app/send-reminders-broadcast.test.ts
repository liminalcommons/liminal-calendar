/**
 * @jest-environment node
 *
 * Integration test: broadcast step is gated by BROADCAST_ENABLED.
 *
 * TODO (Task 6 positive-case deferred): add a test that sets
 * BROADCAST_ENABLED=true and verifies computeBroadcastRecipients is called and
 * pushes are dispatched. Deferred because it requires a more elaborate db mock
 * that exercises the full PUSH_WINDOWS loop including the at-start branch.
 */

jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/notifications/broadcast', () => ({
  ...(jest.requireActual('@/lib/notifications/broadcast') as object),
  computeBroadcastRecipients: jest.fn(),
}));
jest.mock('@/lib/notifications/push', () => ({
  sendPushToUsers: jest.fn(),
}));
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('@/lib/notifications/inbox/repo', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 1 }),
}));
jest.mock('@/lib/notifications/reminders', () => ({
  buildReminderEmail: jest.fn().mockReturnValue({ subject: 'Test', html: '<p>x</p>' }),
}));
jest.mock('@/lib/notifications/reminder-dispatch', () => {
  const actual = jest.requireActual('@/lib/notifications/reminder-dispatch');
  return {
    ...actual,
    computeReminderWindow: jest.fn().mockReturnValue({
      windowStart: new Date('2026-04-27T00:00:00Z'),
      windowEnd: new Date('2026-04-27T23:59:59Z'),
    }),
    // Include push-start window so the broadcast branch is entered
    PUSH_WINDOWS: [
      {
        type: 'push-start',
        minMin: -5,
        maxMin: 5,
        title: (t: string) => t,
        body: 'Starting now',
      },
    ],
    EMAIL_WINDOWS: [],
    computePostEventWindow: jest.fn().mockReturnValue({
      windowStart: new Date('2026-04-27T00:00:00Z'),
      windowEnd: new Date('2026-04-27T23:59:59Z'),
    }),
    POST_EVENT_PUSH_WINDOW: { type: 'post-event', minMinAfterEnd: 5, maxMinAfterEnd: 35 },
  };
});

describe('send-reminders: broadcast step', () => {
  const originalFlag = process.env.BROADCAST_ENABLED;
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.BROADCAST_ENABLED = originalFlag;
    process.env.CRON_SECRET = originalSecret;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('skips broadcast when BROADCAST_ENABLED is false', async () => {
    process.env.BROADCAST_ENABLED = 'false';
    process.env.CRON_SECRET = 'test-secret';

    // Re-import after env change so BROADCAST_ENABLED is evaluated fresh
    jest.resetModules();

    // Re-apply mocks after resetModules
    jest.mock('@/lib/db', () => ({ db: {} }));
    jest.mock('@/lib/notifications/broadcast', () => ({
      BROADCAST_ENABLED: false,
      BROADCAST_START_TYPE: 'broadcast.start',
      computeBroadcastRecipients: jest.fn(),
    }));
    jest.mock('@/lib/notifications/push', () => ({
      sendPushToUsers: jest.fn().mockResolvedValue({ sent: 0 }),
    }));
    jest.mock('@/lib/notifications/reminder-dispatch', () => ({
      computeReminderWindow: jest.fn().mockReturnValue({
        windowStart: new Date('2026-04-27T00:00:00Z'),
        windowEnd: new Date('2026-04-27T23:59:59Z'),
      }),
      PUSH_WINDOWS: [
        {
          type: 'push-start',
          minMin: -5,
          maxMin: 5,
          title: (t: string) => t,
          body: 'Starting now',
        },
      ],
      EMAIL_WINDOWS: [],
      computePostEventWindow: jest.fn().mockReturnValue({
        windowStart: new Date('2026-04-27T00:00:00Z'),
        windowEnd: new Date('2026-04-27T23:59:59Z'),
      }),
      POST_EVENT_PUSH_WINDOW: { type: 'post-event', minMinAfterEnd: 5, maxMinAfterEnd: 35 },
      filterUnsentRecipients: jest.fn().mockReturnValue([]),
      groupPushRecipientsByEvent: jest.fn().mockReturnValue(new Map()),
      pickPushClickUrl: jest.fn().mockReturnValue('/events/1'),
      filterUnreportedRecipients: jest.fn().mockReturnValue([]),
      buildPostEventPayload: jest.fn().mockReturnValue({ title: 'T', body: 'B', url: '/x', tag: 'y' }),
    }));
    jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }));
    jest.mock('@/lib/notifications/inbox/repo', () => ({
      createNotification: jest.fn().mockResolvedValue({ id: 1 }),
    }));
    jest.mock('@/lib/notifications/reminders', () => ({
      buildReminderEmail: jest.fn().mockReturnValue({ subject: 'S', html: '<p/>' }),
    }));
    jest.mock('@/lib/auth/resolve-member-id', () => ({
      resolveMemberIds: jest.fn().mockResolvedValue(new Map()),
    }));

    // Setup db mock with empty results for all queries
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
    dbModule.db.select = () => {
      const fromResult = {
        where: () => Promise.resolve([]),
        innerJoin: () => ({
          where: () => Promise.resolve([]),
          innerJoin: () => ({ where: () => Promise.resolve([]) }),
        }),
      };
      return { from: () => fromResult };
    };
    dbModule.db.insert = () => ({
      values: () => ({ onConflictDoNothing: () => Promise.resolve() }),
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const broadcastMod = require('@/lib/notifications/broadcast') as {
      computeBroadcastRecipients: jest.Mock;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require('@/app/api/cron/send-reminders/route') as {
      GET: (req: Request) => Promise<Response>;
    };

    const req = new Request('http://x/api/cron/send-reminders', {
      headers: { Authorization: 'Bearer test-secret' },
    });

    const res = await GET(req);
    // Route should complete successfully (200) with no broadcast activity
    expect(res.status).toBe(200);
    expect(broadcastMod.computeBroadcastRecipients).not.toHaveBeenCalled();
  });
});
