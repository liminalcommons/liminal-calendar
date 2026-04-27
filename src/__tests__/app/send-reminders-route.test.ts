/**
 * @jest-environment node
 */

jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('@/lib/notifications/push', () => ({
  sendPushToUsers: jest.fn().mockResolvedValue({ sent: 0 }),
}));
jest.mock('@/lib/notifications/reminders', () => ({
  buildReminderEmail: jest.fn().mockReturnValue({ subject: 'Test', html: '<p>x</p>' }),
}));
jest.mock('@/lib/notifications/reminder-dispatch', () => ({
  computeReminderWindow: jest.fn().mockReturnValue({
    windowStart: new Date('2026-04-27T00:00:00Z'),
    windowEnd: new Date('2026-04-27T23:59:59Z'),
  }),
  filterUnsentRecipients: jest.fn().mockReturnValue([]),
  groupPushRecipientsByEvent: jest.fn().mockReturnValue(new Map()),
  pickPushClickUrl: jest.fn().mockReturnValue('https://x'),
  PUSH_WINDOWS: [], // disable push loop for these tests
  EMAIL_WINDOWS: [['24hr', 23 * 60, 25 * 60]],
}));

import { sendEmail } from '@/lib/email';
import { GET } from '@/app/api/cron/send-reminders/route';

const mockSendEmail = sendEmail as unknown as jest.Mock;

// Build a queue-driven fake for db.select. Each .select() call shifts the next
// pre-canned result off the queue. Each result is the array eventually
// returned by .from(...).innerJoin(...).where(...) OR .from(...).where(...).
function setupSelectQueue(results: unknown[][]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  const queue = [...results];

  dbModule.db.select = () => {
    const next = queue.shift() ?? [];
    // The chain may or may not include innerJoin — return an object that
    // supports both `.from().where()` and `.from().innerJoin().where()`.
    const terminal = { __nextResult: next };
    const fromResult = {
      where: () => Promise.resolve(terminal.__nextResult),
      innerJoin: () => ({
        where: () => Promise.resolve(terminal.__nextResult),
      }),
    };
    return { from: () => fromResult };
  };

  // Mock insert chain (notificationLog) used after a successful send.
  dbModule.db.insert = () => ({
    values: () => ({ onConflictDoNothing: () => Promise.resolve() }),
  });
}

function makeReq(authHeader: string | null = 'Bearer test_cron_secret'): Request {
  return new Request('http://localhost/api/cron/send-reminders', {
    method: 'GET',
    headers: authHeader ? { Authorization: authHeader } : {},
  });
}

describe('GET /api/cron/send-reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test_cron_secret';
    mockSendEmail.mockResolvedValue({ success: true });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeReq(null));
    expect(res.status).toBe(401);
  });

  it('returns 401 when CRON_SECRET env is unset', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq('Bearer anything'));
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const res = await GET(makeReq('Bearer wrong_secret'));
    expect(res.status).toBe(401);
  });

  it('returns 200 with zero counts when no due events', async () => {
    // dueEvents query returns []
    setupSelectQueue([[]]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.errors).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('sends email to a Hylo Member (lookup matches members.hyloId)', async () => {
    setupSelectQueue([
      // 1st select: dueEvents (events innerJoin rsvps where window+remindMe+!no)
      [
        {
          eventId: 1,
          title: 'Hylo Event',
          startsAt: new Date('2026-04-28T10:00:00Z'),
          endsAt: null,
          location: null,
          description: null,
          eventTimezone: 'UTC',
          userId: 'h-42', // Hylo userId on rsvps row
        },
      ],
      // 2nd select: alreadySent — empty
      [],
      // 3rd select: memberRows lookup by OR(hyloId, clerkId)
      [{ hyloId: 'h-42', clerkId: null, email: 'alice@x.y', timezone: 'UTC' }],
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.errors).toBe(0);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toBe('alice@x.y');
  });

  it('sends email to a Clerk-only Member (lookup matches members.clerkId)', async () => {
    // This is the path the d3cab7c fix enabled. Without the fix, the
    // memberRows query would have used inArray(hyloId, ['clerk_xyz'])
    // and matched nothing → sent=0. With the fix, the OR predicate
    // matches by clerkId and emails get delivered.
    setupSelectQueue([
      // dueEvents — userId is a clerkId (Clerk-only Member's RSVP)
      [
        {
          eventId: 2,
          title: 'Clerk Event',
          startsAt: new Date('2026-04-28T10:00:00Z'),
          endsAt: null,
          location: null,
          description: null,
          eventTimezone: 'UTC',
          userId: 'clerk_xyz',
        },
      ],
      // alreadySent — empty
      [],
      // memberRows — Clerk-only Member (hyloId null, clerkId set, email set)
      [{ hyloId: null, clerkId: 'clerk_xyz', email: 'bob@x.y', timezone: 'UTC' }],
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toBe('bob@x.y');
  });

  it('skips when notification was already sent', async () => {
    setupSelectQueue([
      [
        {
          eventId: 3,
          title: 'X',
          startsAt: new Date('2026-04-28T10:00:00Z'),
          endsAt: null,
          location: null,
          description: null,
          eventTimezone: 'UTC',
          userId: 'h-1',
        },
      ],
      // alreadySent contains this exact (eventId, userId) for type='24hr'
      [{ eventId: 3, userId: 'h-1' }],
      // memberRows would still return — but skipped before email send
      [{ hyloId: 'h-1', clerkId: null, email: 'a@x.y', timezone: 'UTC' }],
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('counts errors when sendEmail fails', async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: 'smtp down' });
    setupSelectQueue([
      [
        {
          eventId: 4,
          title: 'X',
          startsAt: new Date('2026-04-28T10:00:00Z'),
          endsAt: null,
          location: null,
          description: null,
          eventTimezone: 'UTC',
          userId: 'h-2',
        },
      ],
      [],
      [{ hyloId: 'h-2', clerkId: null, email: 'c@x.y', timezone: 'UTC' }],
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.errors).toBe(1);
  });

  it('skips when Member has no email', async () => {
    setupSelectQueue([
      [
        {
          eventId: 5,
          title: 'X',
          startsAt: new Date('2026-04-28T10:00:00Z'),
          endsAt: null,
          location: null,
          description: null,
          eventTimezone: 'UTC',
          userId: 'h-3',
        },
      ],
      [],
      // member.email is null
      [{ hyloId: 'h-3', clerkId: null, email: null, timezone: 'UTC' }],
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
