/**
 * @jest-environment node
 *
 * Tests for POST /api/booking/[handle]/[slug]/book — Task 6 of Plan 3 (1:1 Booking).
 *
 * Atomic-ish flow:
 *   1. Resolve handle → ownerMemberId, load event-type by (ownerMemberId, slug).
 *   2. Re-validate the requested startsAt against `computeSlots(...)` (race-safe).
 *   3. Insert events row (visibility=private, sourceEventTypeId set, both
 *      creatorId/memberId populated).
 *   4. Insert two rsvps rows (owner=yes, booker=yes) — dual-write.
 *   5. Insert two booking.confirmed notifications (owner + booker).
 *
 * neon-http db has no transactions; sequential inserts are accepted as
 * the project-wide constraint.
 */

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/booking/handle-resolver', () => ({
  resolveHandleToMemberId: jest.fn(),
}));
jest.mock('@/lib/booking/event-types-repo', () => ({
  getEventTypeBySlug: jest.fn(),
}));
jest.mock('@/lib/booking/availability-to-windows', () => ({
  availabilityToWindows: jest.fn(),
}));
jest.mock('@/lib/booking/castalia-room', () => ({
  mintCastaliaRoomUrl: jest.fn(),
}));
jest.mock('@/lib/notifications/inbox/repo', () => ({
  createNotification: jest.fn(),
}));
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(async () => ({ success: true })),
}));
// next/cache's revalidatePath throws outside a request context; we don't
// care about its output here.
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/cache/revalidate-calendar-views', () => ({
  revalidateCalendarViews: jest.fn(),
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import { resolveHandleToMemberId } from '@/lib/booking/handle-resolver';
import { getEventTypeBySlug } from '@/lib/booking/event-types-repo';
import { availabilityToWindows } from '@/lib/booking/availability-to-windows';
import { mintCastaliaRoomUrl } from '@/lib/booking/castalia-room';
import { createNotification } from '@/lib/notifications/inbox/repo';
import { sendEmail } from '@/lib/email';
import { POST } from '@/app/api/booking/[handle]/[slug]/book/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;
const mockResolveHandle = resolveHandleToMemberId as unknown as jest.Mock;
const mockGetEventTypeBySlug = getEventTypeBySlug as unknown as jest.Mock;
const mockAvailabilityToWindows = availabilityToWindows as unknown as jest.Mock;
const mockMintCastaliaRoomUrl = mintCastaliaRoomUrl as unknown as jest.Mock;
const mockCreateNotification = createNotification as unknown as jest.Mock;
const mockSendEmail = sendEmail as unknown as jest.Mock;

function makeReq(body: unknown): import('next/server').NextRequest {
  return {
    json: async () => body,
  } as unknown as import('next/server').NextRequest;
}

function paramsOf(handle: string, slug: string) {
  return { params: Promise.resolve({ handle, slug }) };
}

const OWNER_MEMBER_ID = 42;
const BOOKER_MEMBER_ID = 7;

const ownerMember = {
  id: OWNER_MEMBER_ID,
  clerkId: null,
  logtoId: 'lg_owner',
  name: 'Alice Owner',
  image: 'https://example.com/alice.png',
  email: 'alice@example.com',
  handle: 'alice',
};

const bookerMember = {
  id: BOOKER_MEMBER_ID,
  clerkId: null,
  logtoId: 'lg_booker',
  name: 'Bob Booker',
  image: 'https://example.com/bob.png',
  email: 'bob@example.com',
  handle: 'bob',
};

const baseEventType = {
  id: 5,
  ownerMemberId: OWNER_MEMBER_ID,
  ownerId: 'lg_owner',
  slug: 'coffee-30',
  title: 'Coffee chat',
  description: 'Quick chat',
  durationMinutes: 30,
  locationKind: 'castalia' as const,
  locationValue: null,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minNoticeMinutes: 0,
  maxDaysAhead: 7,
  active: true,
};

const windowRow = {
  id: 1,
  ownerMemberId: OWNER_MEMBER_ID,
  dayOfWeek: 1, // Tuesday (storage convention 0=Mon..6=Sun)
  startMinute: 12 * 60,
  endMinute: 13 * 60,
  timezone: 'UTC',
};

/**
 * Mock the db.select + db.insert chains. `select` returns blocking events
 * (empty by default) for slot re-validation. `insert` captures the values
 * and returns a fake row.
 */
interface DbMockOpts {
  blockingEvents?: Array<{ startsAt: Date; endsAt: Date | null }>;
  ownerMemberRow?: typeof ownerMember | null;
  insertedEvent?: { id: number };
}

function setupDbMocks(opts: DbMockOpts = {}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schema = require('@/lib/db/schema') as {
    events: unknown;
    members: unknown;
  };

  const insertCalls: Array<{ table: unknown; values: unknown }> = [];
  const insertedEvent = opts.insertedEvent ?? { id: 999 };

  // The route does three distinct selects:
  //   1) owner availability/timezone from `members` — first members call
  //   2) blocking events from `events` — awaited directly, no .limit
  //   3) owner Member row for booking creator name — second members call
  // The availability adapter is jest-mocked at module level, so the value
  // returned for (1) only needs to be a non-null availability string to
  // exercise the parse path; mockAvailabilityToWindows controls the
  // resulting windows.
  let membersCallIdx = 0;
  dbModule.db.select = jest.fn(() => ({
    from: jest.fn((table: unknown) => {
      if (table === schema.members) {
        const idx = membersCallIdx++;
        return {
          where: jest.fn(() => ({
            limit: jest.fn(() => {
              if (idx === 0) {
                return Promise.resolve([{ availability: '[]', timezone: 'UTC' }]);
              }
              return Promise.resolve(
                opts.ownerMemberRow === null
                  ? []
                  : [opts.ownerMemberRow ?? ownerMember],
              );
            }),
          })),
        };
      }
      return {
        where: jest.fn(() => Promise.resolve(opts.blockingEvents ?? [])),
      };
    }),
  }));

  dbModule.db.insert = jest.fn((table: unknown) => ({
    values: jest.fn((values: unknown) => {
      insertCalls.push({ table, values });
      return {
        returning: jest.fn(() => Promise.resolve([insertedEvent])),
      };
    }),
  }));

  return { insertCalls };
}

describe('POST /api/booking/[handle]/[slug]/book', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Freeze "now" to 2026-05-11 Mon 12:00 UTC.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('401 when not signed in', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(401);
  });

  it('400 when body is missing startsAt', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    const res = await POST(makeReq({}), paramsOf('alice', 'coffee-30'));
    expect(res.status).toBe(400);
  });

  it('400 when startsAt is not an ISO datetime', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    const res = await POST(
      makeReq({ startsAt: 'not-a-date' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(400);
  });

  it('404 when handle resolves to null', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(null);
    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('nobody', 'coffee-30'),
    );
    expect(res.status).toBe(404);
  });

  it('404 when event-type slug not found for owner', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue(null);
    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'unknown'),
    );
    expect(res.status).toBe(404);
  });

  it('400 when booker tries to book themselves', async () => {
    // Booker IS the owner.
    mockGetCurrentMember.mockResolvedValue({ ...bookerMember, id: OWNER_MEMBER_ID });
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(400);
  });

  it('409 when requested startsAt is not in computed slots', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    mockAvailabilityToWindows.mockReturnValue([windowRow]);
    setupDbMocks({ blockingEvents: [] });

    // Tuesday 2026-05-12 at 15:00 UTC is OUTSIDE the 12:00-13:00 window.
    const res = await POST(
      makeReq({ startsAt: '2026-05-12T15:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(409);
  });

  it('201 — creates event row with visibility=private, sourceEventTypeId, dual-write identity', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    mockAvailabilityToWindows.mockReturnValue([windowRow]);
    mockMintCastaliaRoomUrl.mockResolvedValue('https://castalia.one/r/abc123');
    const { insertCalls } = setupDbMocks({ blockingEvents: [] });

    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(201);

    // First insert is the event row.
    const eventInsert = insertCalls[0].values as Record<string, unknown>;
    expect(eventInsert.visibility).toBe('private');
    expect(eventInsert.sourceEventTypeId).toBe(baseEventType.id);
    expect(eventInsert.memberId).toBe(OWNER_MEMBER_ID);
    expect(eventInsert.creatorId).toBe('lg_owner'); // logtoId precedence
    expect(eventInsert.creatorName).toBe('Alice Owner');
    expect(eventInsert.creatorImage).toBe('https://example.com/alice.png');
    expect(eventInsert.title).toBe('Coffee chat');
    expect(eventInsert.timezone).toBe('UTC');
    expect((eventInsert.startsAt as Date).toISOString()).toBe('2026-05-12T12:00:00.000Z');
    expect((eventInsert.endsAt as Date).toISOString()).toBe('2026-05-12T12:30:00.000Z');
  });

  it('201 — creates 2 rsvps rows (owner=yes, booker=yes) with dual-write', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    mockAvailabilityToWindows.mockReturnValue([windowRow]);
    mockMintCastaliaRoomUrl.mockResolvedValue('https://castalia.one/r/abc123');
    const { insertCalls } = setupDbMocks({ blockingEvents: [] });

    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(201);

    // insertCalls[0] = event; [1] = owner rsvp; [2] = booker rsvp.
    const ownerRsvp = insertCalls[1].values as Record<string, unknown>;
    expect(ownerRsvp.userId).toBe('lg_owner');
    expect(ownerRsvp.memberId).toBe(OWNER_MEMBER_ID);
    expect(ownerRsvp.userName).toBe('Alice Owner');
    expect(ownerRsvp.status).toBe('yes');
    expect(ownerRsvp.eventId).toBe(999);

    const bookerRsvp = insertCalls[2].values as Record<string, unknown>;
    expect(bookerRsvp.userId).toBe('lg_booker');
    expect(bookerRsvp.memberId).toBe(BOOKER_MEMBER_ID);
    expect(bookerRsvp.userName).toBe('Bob Booker');
    expect(bookerRsvp.status).toBe('yes');
    expect(bookerRsvp.eventId).toBe(999);
  });

  it('201 — location is castalia URL when locationKind=castalia', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType); // castalia
    mockAvailabilityToWindows.mockReturnValue([windowRow]);
    mockMintCastaliaRoomUrl.mockResolvedValue('https://castalia.one/r/zzz999');
    const { insertCalls } = setupDbMocks({ blockingEvents: [] });

    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(201);
    expect(mockMintCastaliaRoomUrl).toHaveBeenCalledWith({
      ownerId: OWNER_MEMBER_ID,
      bookerId: BOOKER_MEMBER_ID,
    });
    const eventInsert = insertCalls[0].values as Record<string, unknown>;
    expect(eventInsert.location).toBe('https://castalia.one/r/zzz999');
  });

  it('201 — location is locationValue when locationKind=external_link', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue({
      ...baseEventType,
      locationKind: 'external_link',
      locationValue: 'https://zoom.us/j/123',
    });
    mockAvailabilityToWindows.mockReturnValue([windowRow]);
    const { insertCalls } = setupDbMocks({ blockingEvents: [] });

    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(201);
    expect(mockMintCastaliaRoomUrl).not.toHaveBeenCalled();
    const eventInsert = insertCalls[0].values as Record<string, unknown>;
    expect(eventInsert.location).toBe('https://zoom.us/j/123');
  });

  it('201 — dispatches 2 booking.confirmed notifications (owner + booker)', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    mockAvailabilityToWindows.mockReturnValue([windowRow]);
    mockMintCastaliaRoomUrl.mockResolvedValue('https://castalia.one/r/abc123');
    setupDbMocks({ blockingEvents: [] });

    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(201);

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    const calls = mockCreateNotification.mock.calls.map((c) => c[1]);

    const ownerNotif = calls.find((c) => c.userId === 'lg_owner');
    const bookerNotif = calls.find((c) => c.userId === 'lg_booker');
    expect(ownerNotif).toBeDefined();
    expect(bookerNotif).toBeDefined();

    expect(ownerNotif.type).toBe('booking.confirmed');
    expect(ownerNotif.memberId).toBe(OWNER_MEMBER_ID);
    expect(ownerNotif.eventId).toBe(999);
    expect(ownerNotif.actorId).toBe('lg_booker');
    expect(ownerNotif.actorMemberId).toBe(BOOKER_MEMBER_ID);
    expect(ownerNotif.payload).toMatchObject({
      startsAt: '2026-05-12T12:00:00.000Z',
      location: 'https://castalia.one/r/abc123',
    });

    expect(bookerNotif.type).toBe('booking.confirmed');
    expect(bookerNotif.memberId).toBe(BOOKER_MEMBER_ID);
    expect(bookerNotif.eventId).toBe(999);
  });

  it('201 — sends booking-confirmed email to both owner and booker', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    mockAvailabilityToWindows.mockReturnValue([windowRow]);
    mockMintCastaliaRoomUrl.mockResolvedValue('https://castalia.one/r/abc123');
    setupDbMocks({ blockingEvents: [] });

    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(201);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const recipients = mockSendEmail.mock.calls.map((c) => c[0]);
    expect(recipients).toContain('alice@example.com');
    expect(recipients).toContain('bob@example.com');

    const ownerCall = mockSendEmail.mock.calls.find((c) => c[0] === 'alice@example.com');
    const bookerCall = mockSendEmail.mock.calls.find((c) => c[0] === 'bob@example.com');
    expect(ownerCall![1]).toMatch(/Bob Booker booked/);
    expect(bookerCall![1]).toMatch(/Booked: .*with Alice Owner/);
  });

  it('201 — skips email when recipient has no email address', async () => {
    mockGetCurrentMember.mockResolvedValue({ ...bookerMember, email: null });
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    mockAvailabilityToWindows.mockReturnValue([windowRow]);
    mockMintCastaliaRoomUrl.mockResolvedValue('https://castalia.one/r/abc123');
    setupDbMocks({ blockingEvents: [] });

    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );
    expect(res.status).toBe(201);

    // Owner has email; booker does not. Only one send.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toBe('alice@example.com');
  });

  // Race-safety regression: a partial unique index
  // `events_booking_owner_starts_unique` on (member_id, starts_at) WHERE
  // source_event_type_id IS NOT NULL guards against two concurrent bookers
  // both passing computeSlots() and inserting duplicate events at the same
  // owner+time. When PG raises 23505, the route must return 409, not 500.
  it('409 when concurrent booker wins the unique index (PG 23505)', async () => {
    mockGetCurrentMember.mockResolvedValue(bookerMember);
    mockResolveHandle.mockResolvedValue(OWNER_MEMBER_ID);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    mockAvailabilityToWindows.mockReturnValue([windowRow]);
    mockMintCastaliaRoomUrl.mockResolvedValue('https://castalia.one/r/abc123');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schema = require('@/lib/db/schema') as {
      events: unknown;
      members: unknown;
    };

    // select chain: availability lookup → blocking events ([]) → owner row.
    let membersCallIdx = 0;
    dbModule.db.select = jest.fn(() => ({
      from: jest.fn((table: unknown) => {
        if (table === schema.members) {
          const idx = membersCallIdx++;
          return {
            where: jest.fn(() => ({
              limit: jest.fn(() => {
                if (idx === 0) return Promise.resolve([{ availability: null, timezone: null }]);
                return Promise.resolve([ownerMember]);
              }),
            })),
          };
        }
        return { where: jest.fn(() => Promise.resolve([])) };
      }),
    }));

    // insert chain: throws a PG-shaped unique violation on .returning().
    const uniqueErr = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "events_booking_owner_starts_unique"',
      ),
      { code: '23505' },
    );
    dbModule.db.insert = jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn(() => Promise.reject(uniqueErr)),
      })),
    }));

    const res = await POST(
      makeReq({ startsAt: '2026-05-12T12:00:00.000Z' }),
      paramsOf('alice', 'coffee-30'),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no longer available/i);

    // No RSVPs or notifications attempted after the event-insert failure.
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
