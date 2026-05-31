/**
 * @jest-environment node
 *
 * PATCH /api/events/[id] — scope handling for the drag-to-reschedule flow.
 *
 * The drag UX sends `scope: 'all'` on recurring events. The server's existing
 * behavior (update events.startsAt/endsAt) IS the "all" semantic, because
 * expandRecurringEvents uses the row as the template.
 *
 * Contract locked here: explicit validation that rejects unsupported scopes
 * ('this_only', 'this_and_following') as 501 Not Implemented, rejects unknown
 * values as 400, and accepts 'all' (or omitted) as 200. Defense in depth — the
 * modal disables the unsupported branches client-side, but the server must not
 * silently accept them either, since "silent accept = mystery bug" if the modal
 * gating ever drifts.
 *
 * Auth: the route reads getAuthedUser() from '@/lib/auth/get-authed-user' and
 * gates field edits behind canEditEvent(role, isCreator). isCreator is true when
 * event.memberId === authed.memberId, so the mocked caller's memberId is set to
 * match the event row's memberId, making the caller the creator (passes the
 * gate at any role tier). canEditEvent is exercised for real, not mocked.
 */

jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/cache/revalidate-calendar-views', () => ({
  revalidateCalendarViews: jest.fn(),
}));
jest.mock('@/lib/notifications/fanout', () => ({
  diffEventForNotification: jest.fn(() => null),
  fanoutEventChanged: jest.fn(),
  fanoutEventCancelled: jest.fn(),
}));
jest.mock('@/lib/db/to-display-event', () => ({
  dbEventToDisplayEvent: (e: unknown) => ({
    id: '42',
    starts_at: (e as { startsAt: Date }).startsAt.toISOString(),
    ends_at: (e as { endsAt: Date | null }).endsAt?.toISOString() ?? null,
    recurrenceRule: (e as { recurrenceRule: string | null }).recurrenceRule,
  }),
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { PATCH } from '@/app/api/events/[id]/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;

const CREATOR_MEMBER_ID = 7;

const baseRow = {
  id: 42,
  memberId: CREATOR_MEMBER_ID,
  title: 'Weekly Sync',
  description: 'sync',
  startsAt: new Date('2026-05-03T10:00:00Z'),
  endsAt: new Date('2026-05-03T11:00:00Z'),
  timezone: 'UTC',
  location: null,
  imageUrl: null,
  recurrenceRule: 'weekly',
  cancelledByMemberId: null,
};

function setupDbMocks(initialRow = baseRow) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  let updatedRow: Record<string, unknown> = { ...initialRow };

  // The route uses `select().from().where()` twice: once to load the event
  // (returns [initialRow]) and once after the update to load rsvps (returns []).
  // Both share the same chain shape; the event load awaits the first row via
  // destructuring `const [event] = ...`, so a single-element array works, and
  // the rsvps query awaits the whole array. Returning [initialRow] for the
  // event load and [] for rsvps would require call counting; instead we return
  // a thenable that resolves to [initialRow] for the event lookup and rely on
  // the rsvps lookup tolerating a non-empty array (dbEventToDisplayEvent is
  // mocked and ignores rsvps). To keep it simple and correct, return [initialRow]
  // for the first .where and [] for subsequent ones.
  let selectCalls = 0;
  dbModule.db.select = () => ({
    from: () => ({
      where: () => {
        selectCalls += 1;
        return Promise.resolve(selectCalls === 1 ? [initialRow] : []);
      },
    }),
  });

  dbModule.db.update = () => ({
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: () => {
          updatedRow = { ...updatedRow, ...values };
          return Promise.resolve([updatedRow]);
        },
      }),
    }),
  });
}

function makeReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest;
}

const params = { params: Promise.resolve({ id: '42' }) };

describe('PATCH /api/events/[id] — scope handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Caller is the event creator (memberId matches the row), role 'host'.
    // isCreator === true → canEditEvent(role, isCreator) === true at any tier.
    mockGetAuthedUser.mockResolvedValue({
      memberId: CREATOR_MEMBER_ID,
      id: 'user-abc',
      role: 'host',
      name: 'Me',
      image: null,
    });
    setupDbMocks();
  });

  it('accepts scope="all" on recurring events and updates startsAt/endsAt', async () => {
    const res = await PATCH(
      makeReq({
        scope: 'all',
        startTime: '2026-05-03T11:00:00Z',
        endTime: '2026-05-03T12:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.starts_at).toBe('2026-05-03T11:00:00.000Z');
    expect(body.ends_at).toBe('2026-05-03T12:00:00.000Z');
    // Preserved — scope='all' on a recurring event must NOT clear the rule.
    expect(body.recurrenceRule).toBe('weekly');
  });

  it('rejects scope="this_only" with 501 Not Implemented', async () => {
    const res = await PATCH(
      makeReq({
        scope: 'this_only',
        startTime: '2026-05-03T11:00:00Z',
        endTime: '2026-05-03T12:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/this_only|not implemented/i);
  });

  it('rejects scope="this_and_following" with 501 Not Implemented', async () => {
    const res = await PATCH(
      makeReq({
        scope: 'this_and_following',
        startTime: '2026-05-03T11:00:00Z',
        endTime: '2026-05-03T12:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(501);
  });

  it('rejects unknown scope with 400 Bad Request', async () => {
    const res = await PATCH(
      makeReq({
        scope: 'definitely_not_a_real_scope',
        startTime: '2026-05-03T11:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('accepts requests without scope (legacy edit-form path)', async () => {
    const res = await PATCH(
      makeReq({
        startTime: '2026-05-03T11:00:00Z',
        endTime: '2026-05-03T12:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.starts_at).toBe('2026-05-03T11:00:00.000Z');
  });
});
