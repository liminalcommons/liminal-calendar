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
jest.mock('@/lib/notifications/inbox/repo', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 1 }),
}));
jest.mock('@/lib/notifications/reminders', () => ({
  buildReminderEmail: jest.fn().mockReturnValue({ subject: 'Test', html: '<p>x</p>' }),
}));
jest.mock('@/lib/notifications/reminder-dispatch', () => {
  const actual = jest.requireActual('@/lib/notifications/reminder-dispatch');
  return {
    // Use real helpers for filtering / grouping / payload / post-event window.
    ...actual,
    // Fix the email window so we don't depend on wall-clock for the email pass.
    computeReminderWindow: jest.fn().mockReturnValue({
      windowStart: new Date('2026-04-27T00:00:00Z'),
      windowEnd: new Date('2026-04-27T23:59:59Z'),
    }),
    PUSH_WINDOWS: [], // disable pre-event push loop for these tests
    EMAIL_WINDOWS: [['24hr', 23 * 60, 25 * 60]],
  };
});

import { sendEmail } from '@/lib/email';
import { sendPushToUsers } from '@/lib/notifications/push';
import { createNotification } from '@/lib/notifications/inbox/repo';
import { GET } from '@/app/api/cron/send-reminders/route';

const mockSendEmail = sendEmail as unknown as jest.Mock;
const mockSendPushToUsers = sendPushToUsers as unknown as jest.Mock;
const mockCreateNotification = createNotification as unknown as jest.Mock;

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
    // Support .from().where(), .from().innerJoin().where(),
    // and .from().innerJoin().innerJoin().where() (post-Task-4 shape).
    const fromResult = {
      where: () => Promise.resolve(terminal.__nextResult),
      innerJoin: () => ({
        where: () => Promise.resolve(terminal.__nextResult),
        innerJoin: () => ({
          where: () => Promise.resolve(terminal.__nextResult),
        }),
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

  it('sends email to a Logto Member (lookup matches members.logtoId)', async () => {
    setupSelectQueue([
      // 1st select: dueEvents (events innerJoin rsvps where window+remindMe+!no)
      [
        {
          eventId: 1,
          title: 'Logto Event',
          startsAt: new Date('2026-04-28T10:00:00Z'),
          endsAt: null,
          location: null,
          description: null,
          eventTimezone: 'UTC',
          userId: 'logto-42', // Logto userId on rsvps row
        },
      ],
      // 2nd select: alreadySent — empty
      [],
      // 3rd select: memberRows lookup by OR(clerkId, logtoId)
      [{ logtoId: 'logto-42', clerkId: null, email: 'alice@x.y', timezone: 'UTC' }],
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.errors).toBe(0);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toBe('alice@x.y');
    // Inbox row written for the recipient.
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'logto-42',
        type: 'reminder.24hr',
        eventId: 1,
      }),
    );
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
          userId: 'logto-1',
        },
      ],
      // alreadySent contains this exact (eventId, userId) for type='24hr'
      [{ eventId: 3, userId: 'logto-1' }],
      // memberRows would still return — but skipped before email send
      [{ logtoId: 'logto-1', clerkId: null, email: 'a@x.y', timezone: 'UTC' }],
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
          userId: 'logto-2',
        },
      ],
      [],
      [{ logtoId: 'logto-2', clerkId: null, email: 'c@x.y', timezone: 'UTC' }],
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.errors).toBe(1);
  });

  // ── Post-event push prompt branch ──
  // Each scenario in this block exhausts the email pass first (3 selects: due
  // events / alreadySent / memberRows), then exercises the post-event pass
  // (up to 3 selects: due / alreadySentPostEvent / alreadyReported).

  it('post-event: sends push to RSVP=yes attendees who have not reported', async () => {
    setupSelectQueue([
      // Email pass: empty due events
      [],
      // Post-event pass: due
      [{ eventId: 100, title: 'After-Party', userId: 'h-9' }],
      // Post-event pass: alreadySent (none)
      [],
      // Post-event pass: alreadyReported (none)
      [],
    ]);
    mockSendPushToUsers.mockResolvedValue({ sent: 1, failed: 0 });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.postEventSent).toBe(1);
    expect(mockSendPushToUsers).toHaveBeenCalledTimes(1);
    const [userIds, payload] = mockSendPushToUsers.mock.calls[0];
    expect(userIds).toEqual(['h-9']);
    expect(payload.title).toContain('After-Party');
    expect(payload.url).toContain('/events/100#attendance-report');
    expect(payload.tag).toBe('post-event-100');
    // Inbox row written for the post-event prompt.
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'h-9',
        type: 'post-event.prompt',
        eventId: 100,
      }),
    );
  });

  it('post-event: skips users who already filed an attendance report', async () => {
    setupSelectQueue([
      [], // email empty
      // Post-event due: two users on event 100
      [
        { eventId: 100, title: 'X', userId: 'h-1' },
        { eventId: 100, title: 'X', userId: 'h-2' },
      ],
      // Post-event alreadySent: none
      [],
      // Post-event alreadyReported: h-1 already filed
      [{ eventId: 100, userId: 'h-1' }],
    ]);
    mockSendPushToUsers.mockResolvedValue({ sent: 1, failed: 0 });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.postEventSent).toBe(1);
    expect(mockSendPushToUsers).toHaveBeenCalledTimes(1);
    expect(mockSendPushToUsers.mock.calls[0][0]).toEqual(['h-2']);
  });

  it('post-event: skips users already pushed (notificationLog dedupe)', async () => {
    setupSelectQueue([
      [], // email empty
      [
        { eventId: 100, title: 'X', userId: 'h-1' },
        { eventId: 100, title: 'X', userId: 'h-2' },
      ],
      // alreadySent: h-1 already received the post-event prompt
      [{ eventId: 100, userId: 'h-1' }],
      // alreadyReported: none
      [],
    ]);
    mockSendPushToUsers.mockResolvedValue({ sent: 1, failed: 0 });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.postEventSent).toBe(1);
    expect(mockSendPushToUsers.mock.calls[0][0]).toEqual(['h-2']);
  });

  it('post-event: returns 0 when no events qualify', async () => {
    setupSelectQueue([
      [], // email empty
      [], // post-event due empty
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.postEventSent).toBe(0);
    expect(mockSendPushToUsers).not.toHaveBeenCalled();
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
          userId: 'logto-3',
        },
      ],
      [],
      // member.email is null
      [{ logtoId: 'logto-3', clerkId: null, email: null, timezone: 'UTC' }],
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
