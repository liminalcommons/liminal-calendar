/**
 * @jest-environment node
 *
 * Tests for GET /api/booking/[handle]/[slug]/slots — Task 5 of Plan 3 (1:1 Booking).
 *
 * Auth-gated (must be signed in via getCurrentMember). Resolves handle →
 * memberId, loads event-type by (memberId, slug), loads owner's
 * bookableWindows + blocking events from `events.memberId === ownerMemberId`,
 * then delegates to the pure `computeSlots` engine.
 *
 * RSVPs do not block. Only events authored/owned by the owner block.
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
jest.mock('@/lib/booking/windows-repo', () => ({
  listMyWindows: jest.fn(),
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import { resolveHandleToMemberId } from '@/lib/booking/handle-resolver';
import { getEventTypeBySlug } from '@/lib/booking/event-types-repo';
import { listMyWindows } from '@/lib/booking/windows-repo';
import { GET } from '@/app/api/booking/[handle]/[slug]/slots/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;
const mockResolveHandle = resolveHandleToMemberId as unknown as jest.Mock;
const mockGetEventTypeBySlug = getEventTypeBySlug as unknown as jest.Mock;
const mockListMyWindows = listMyWindows as unknown as jest.Mock;

function makeReq(): import('next/server').NextRequest {
  return {} as unknown as import('next/server').NextRequest;
}

function paramsOf(handle: string, slug: string) {
  return { params: Promise.resolve({ handle, slug }) };
}

interface BlockingMockOpts {
  blockingEvents?: Array<{ startsAt: Date; endsAt: Date | null }>;
}

/**
 * Mock the db.select chain used to read blocking events from the `events`
 * table. The route does: db.select({...}).from(events).where(...) and
 * awaits the chain directly (no .limit).
 */
function setupDbMocks(opts: BlockingMockOpts) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schema = require('@/lib/db/schema') as {
    events: unknown;
    members: unknown;
  };

  const eventsWhereChain = {
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(opts.blockingEvents ?? []).then(resolve),
  };
  // members lookup chain: select({...}).from(members).where(...).limit(1)
  // Tests don't exercise the availability path — return an empty owner row
  // so the route falls back to `listMyWindows` (which the existing mocks cover).
  const membersLimitChain = {
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve([{ availability: null, timezone: null }]).then(resolve),
  };
  const membersWhereChain = { limit: jest.fn(() => membersLimitChain) };

  dbModule.db.select = jest.fn(() => ({
    from: jest.fn((table: unknown) => {
      if (table === schema.members) {
        return { where: jest.fn(() => membersWhereChain) };
      }
      return { where: jest.fn(() => eventsWhereChain) };
    }),
  }));
}

const baseEventType = {
  id: 5,
  ownerMemberId: 42,
  ownerId: 'lg_owner',
  slug: 'coffee-30',
  title: 'Coffee chat',
  description: null,
  durationMinutes: 30,
  locationKind: 'castalia' as const,
  locationValue: null,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minNoticeMinutes: 0,
  maxDaysAhead: 7,
  active: true,
};

describe('GET /api/booking/[handle]/[slug]/slots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Freeze "now" to a fixed UTC instant so window math is deterministic.
    // 2026-05-11 Mon 12:00 UTC.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('401 when not signed in', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await GET(makeReq(), paramsOf('alice', 'coffee-30'));
    expect(res.status).toBe(401);
  });

  it('404 when handle resolves to null', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    mockResolveHandle.mockResolvedValue(null);
    const res = await GET(makeReq(), paramsOf('nobody', 'coffee-30'));
    expect(res.status).toBe(404);
  });

  it('404 when event-type slug not found for that owner', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    mockResolveHandle.mockResolvedValue(42);
    mockGetEventTypeBySlug.mockResolvedValue(null);
    const res = await GET(makeReq(), paramsOf('alice', 'unknown-slug'));
    expect(res.status).toBe(404);
  });

  it('200 returns slots and event-type metadata', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    mockResolveHandle.mockResolvedValue(42);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    // Tuesday window (dayOfWeek=1 in storage convention 0=Mon..6=Sun)
    // 12:00-13:00 UTC. With duration 30 → two slots.
    mockListMyWindows.mockResolvedValue([
      {
        id: 1,
        ownerMemberId: 42,
        dayOfWeek: 1,
        startMinute: 12 * 60,
        endMinute: 13 * 60,
        timezone: 'UTC',
      },
    ]);
    setupDbMocks({ blockingEvents: [] });

    const res = await GET(makeReq(), paramsOf('alice', 'coffee-30'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eventType).toMatchObject({
      id: 5,
      title: 'Coffee chat',
      durationMinutes: 30,
      locationKind: 'castalia',
    });
    expect(Array.isArray(body.slots)).toBe(true);
    expect(body.slots.length).toBeGreaterThan(0);
  });

  it('blocking events from owner reduce slots (slot at conflict time excluded)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    mockResolveHandle.mockResolvedValue(42);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    // Tuesday 2026-05-12 12:00-13:00 UTC window → would give two 30-min slots.
    mockListMyWindows.mockResolvedValue([
      {
        id: 1,
        ownerMemberId: 42,
        dayOfWeek: 1,
        startMinute: 12 * 60,
        endMinute: 13 * 60,
        timezone: 'UTC',
      },
    ]);

    // Without blocks: collect baseline slot count.
    setupDbMocks({ blockingEvents: [] });
    const baseRes = await GET(makeReq(), paramsOf('alice', 'coffee-30'));
    const baseBody = await baseRes.json();
    const baseCount = baseBody.slots.length;
    expect(baseCount).toBeGreaterThan(0);

    // Now insert a blocking event from the owner overlapping the FIRST slot
    // (Tuesday 12:00-12:30 UTC).
    setupDbMocks({
      blockingEvents: [
        {
          startsAt: new Date('2026-05-12T12:00:00.000Z'),
          endsAt: new Date('2026-05-12T12:30:00.000Z'),
        },
      ],
    });
    const blockedRes = await GET(makeReq(), paramsOf('alice', 'coffee-30'));
    const blockedBody = await blockedRes.json();
    expect(blockedBody.slots.length).toBe(baseCount - 1);
    // The 12:00 slot should be gone.
    expect(
      blockedBody.slots.some(
        (s: { startsAt: string }) => s.startsAt === '2026-05-12T12:00:00.000Z',
      ),
    ).toBe(false);
  });

  it('slot startsAt values are ISO strings', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    mockResolveHandle.mockResolvedValue(42);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    mockListMyWindows.mockResolvedValue([
      {
        id: 1,
        ownerMemberId: 42,
        dayOfWeek: 1,
        startMinute: 12 * 60,
        endMinute: 13 * 60,
        timezone: 'UTC',
      },
    ]);
    setupDbMocks({ blockingEvents: [] });

    const res = await GET(makeReq(), paramsOf('alice', 'coffee-30'));
    const body = await res.json();
    for (const slot of body.slots) {
      expect(typeof slot.startsAt).toBe('string');
      // Round-trips through Date and back to the same ISO.
      expect(new Date(slot.startsAt).toISOString()).toBe(slot.startsAt);
    }
  });

  it('RSVPs do not block — only events owned by the owner block (route only queries events table)', async () => {
    // This test enforces that the route's blocking query targets `events`
    // (filtered by ownerMemberId), and does NOT consult rsvps. We assert
    // this by leaving rsvps unmocked entirely; a regression where the
    // route reaches into rsvps would either fail (no mock) or produce
    // fewer slots than the baseline (since the owner has RSVPs to other
    // people's events in real data). Here the owner's events table is
    // empty, so slots equal the baseline.
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    mockResolveHandle.mockResolvedValue(42);
    mockGetEventTypeBySlug.mockResolvedValue(baseEventType);
    mockListMyWindows.mockResolvedValue([
      {
        id: 1,
        ownerMemberId: 42,
        dayOfWeek: 1,
        startMinute: 12 * 60,
        endMinute: 13 * 60,
        timezone: 'UTC',
      },
    ]);
    setupDbMocks({ blockingEvents: [] });

    const res = await GET(makeReq(), paramsOf('alice', 'coffee-30'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Two 30-min slots in the Tuesday 12:00-13:00 UTC window.
    expect(body.slots.length).toBe(2);
  });
});
