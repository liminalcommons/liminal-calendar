/**
 * @jest-environment node
 *
 * Regression tests for Task 8: visibility filter applied to remaining
 * event-list endpoints — ICS feed, comments, rsvp, and rsvped-events.
 *
 * Each test asserts that the visibility helpers are called and that
 * a private event NOT belonging to the caller does NOT appear when
 * the DB mock returns no rows (simulating the predicate filtering it out).
 */

jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/events/visibility', () => ({
  visibleEventsForMemberCondition: jest.fn((memberId: number) => ({ __vis: 'member', memberId })),
  publicOnlyEventsCondition: jest.fn(() => ({ __vis: 'public' })),
}));
jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/comments/repo', () => ({
  createComment: jest.fn(),
  listComments: jest.fn(() => Promise.resolve([])),
  COMMENT_MAX_LENGTH: 2000,
}));
jest.mock('@/lib/rsvp/upsert', () => ({
  upsertRsvp: jest.fn(),
}));
jest.mock('@/lib/newsletter/add-subscriber', () => ({
  addNewsletterSubscriber: jest.fn(),
}));
jest.mock('@/lib/db/to-display-event', () => ({
  dbEventToDisplayEvent: (e: unknown) => e,
}));
jest.mock('@/lib/ics-generator', () => ({
  generateCalendarFeed: jest.fn(() => 'BEGIN:VCALENDAR\nEND:VCALENDAR'),
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { visibleEventsForMemberCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';
import { getCurrentMember } from '@/lib/auth/get-current-member';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;
const mockVisibleForMember = visibleEventsForMemberCondition as unknown as jest.Mock;
const mockPublicOnly = publicOnlyEventsCondition as unknown as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;

// Resolve the unified user shape. Pass null for anonymous, or a memberId-bearing
// object for an authenticated caller.
function setAuth(authed: unknown) {
  mockGetAuthedUser.mockResolvedValue(authed);
}

// ─── DB mock helpers ──────────────────────────────────────────────────────────

function setupDbSelect(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  dbModule.db.select = jest.fn(() => ({
    from: () => ({
      where: () => Promise.resolve(rows),
      orderBy: () => ({
        where: () => Promise.resolve(rows),
        limit: () => ({
          offset: () => ({
            where: () => Promise.resolve(rows),
          }),
        }),
      }),
    }),
  }));
}

function setupDbSelectChain(rows: unknown[]) {
  // For chains with .where().orderBy().limit() etc.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  };
  dbModule.db.select = jest.fn(() => chain);
}

// ─── ICS feed ─────────────────────────────────────────────────────────────────

import { GET as feedGET } from '@/app/api/calendar/feed.ics/route';

function makeIcsReq(params: Record<string, string> = {}): import('next/server').NextRequest {
  const url = new URL('http://localhost/api/calendar/feed.ics');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: { searchParams: url.searchParams } } as unknown as import('next/server').NextRequest;
}

describe('GET /api/calendar/feed.ics — visibility filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses publicOnlyEventsCondition when no token provided', async () => {
    setupDbSelectChain([]);
    const res = await feedGET(makeIcsReq());
    expect(res.status).toBe(200);
    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForMember).not.toHaveBeenCalled();
  });

  it('returns empty ICS when DB returns no events (private event hidden from anonymous)', async () => {
    setupDbSelectChain([]);
    const res = await feedGET(makeIcsReq());
    expect(res.status).toBe(200);
    // publicOnlyEventsCondition applied; DB returns nothing → no private events leak
    expect(mockPublicOnly).toHaveBeenCalled();
  });
});

// ─── comments — eventExists visibility ────────────────────────────────────────

import { GET as commentsGET } from '@/app/api/events/[id]/comments/route';

const commentsParams = { params: Promise.resolve({ id: '7' }) };

describe('GET /api/events/[id]/comments — visibility on eventExists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls publicOnlyEventsCondition when no user is signed in', async () => {
    setAuth(null);
    setupDbSelect([]); // event not found → 404
    const res = await commentsGET({} as import('next/server').NextRequest, commentsParams);
    expect(res.status).toBe(404);
    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForMember).not.toHaveBeenCalled();
  });

  it('calls visibleEventsForMemberCondition when user is signed in', async () => {
    setAuth({ memberId: 55, id: 'h-55', role: 'member', name: null, image: null });
    setupDbSelect([]); // event not found
    const res = await commentsGET({} as import('next/server').NextRequest, commentsParams);
    expect(res.status).toBe(404);
    expect(mockVisibleForMember).toHaveBeenCalledWith(55);
    expect(mockPublicOnly).not.toHaveBeenCalled();
  });

  it('returns 404 for a private event not belonging to the caller (visibility predicate filtered it)', async () => {
    // Anonymous caller; DB returns [] simulating publicOnlyEventsCondition filtered out the private event
    setAuth(null);
    setupDbSelect([]);
    const res = await commentsGET({} as import('next/server').NextRequest, commentsParams);
    expect(res.status).toBe(404);
  });
});

// ─── rsvp GET — visibility ────────────────────────────────────────────────────

import { GET as rsvpGET } from '@/app/api/events/[id]/rsvp/route';

const rsvpParams = { params: Promise.resolve({ id: '9' }) };

describe('GET /api/events/[id]/rsvp — visibility filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls publicOnlyEventsCondition when no user is signed in', async () => {
    setAuth(null);
    // First select: event lookup returns [] (private event hidden)
    setupDbSelect([]);
    const res = await rsvpGET({} as import('next/server').NextRequest, rsvpParams);
    expect(res.status).toBe(404);
    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForMember).not.toHaveBeenCalled();
  });

  it('calls visibleEventsForMemberCondition with memberId when user is signed in', async () => {
    setAuth({ memberId: 99, id: 'h-99', role: 'member', name: null, image: null });
    setupDbSelect([]); // event not found for this user
    const res = await rsvpGET({} as import('next/server').NextRequest, rsvpParams);
    expect(res.status).toBe(404);
    expect(mockVisibleForMember).toHaveBeenCalledWith(99);
  });

  it('returns 404 for private event not belonging to anonymous caller', async () => {
    setAuth(null);
    setupDbSelect([]); // visibility predicate filtered it
    const res = await rsvpGET({} as import('next/server').NextRequest, rsvpParams);
    expect(res.status).toBe(404);
  });
});

// ─── rsvped-events — visibility ───────────────────────────────────────────────

import { GET as rsvpedEventsGET } from '@/app/api/preferences/notifications/rsvped-events/route';

describe('GET /api/preferences/notifications/rsvped-events — visibility filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeRsvpedEventsDbMock(rsvpIds: number[], eventRows: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
    let dataCallCount = 0;
    dbModule.db.select = jest.fn(() => ({
      from: () => ({
        where: (cond: unknown) => {
          const getData = () => {
            dataCallCount++;
            if (dataCallCount === 1) {
              void cond;
              // First select: the rsvps eventId query (awaited directly).
              return rsvpIds.map((id) => ({ eventId: id }));
            }
            return eventRows;
          };
          return {
            // rsvps query — awaited directly without .orderBy()/.limit()
            then: (resolve: (v: unknown) => void) => resolve(getData()),
            // events query — chains .orderBy().limit()
            orderBy: () => ({ limit: () => Promise.resolve(eventRows) }),
          };
        },
        orderBy: () => ({
          limit: () => Promise.resolve(eventRows),
        }),
      }),
    }));
  }

  it('calls visibleEventsForMemberCondition with memberId for authenticated user', async () => {
    setAuth({ memberId: 22, id: 'h-22', role: 'member', name: null, image: null });
    makeRsvpedEventsDbMock([42], []);

    const req = { url: 'http://localhost/api/preferences/notifications/rsvped-events' } as Request;
    const res = await rsvpedEventsGET(req);
    expect(res.status).toBe(200);
    expect(mockVisibleForMember).toHaveBeenCalledWith(22);
  });

  it('returns empty events when DB returns no rows (private event hidden from caller)', async () => {
    setAuth({ memberId: 33, id: 'h-33', role: 'member', name: null, image: null });
    makeRsvpedEventsDbMock([99], []);

    const req = { url: 'http://localhost/api/preferences/notifications/rsvped-events' } as Request;
    const res = await rsvpedEventsGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(0);
  });
});
