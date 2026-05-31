/**
 * @jest-environment node
 *
 * Tests for visibility filtering on GET /api/events/[id].
 *
 * Identity model: the route resolves the caller via getAuthedUser() →
 * AuthedUser | null, then decides visibility by the canonical members.id
 * integer FK:
 *   - authed?.memberId  → visibleEventsForMemberCondition(memberId)
 *   - no member / null  → publicOnlyEventsCondition()
 *
 * The visibility predicate runs in SQL; these tests assert WHICH predicate the
 * route selects and that the route surfaces (200) or hides (404) the row the
 * mocked predicate returns. Personas are mapped by memberId:
 *   creator   → authed.memberId === event.memberId (predicate returns the row)
 *   invited   → memberId present in event_invitations (predicate returns the row)
 *   rsvp      → memberId with an rsvps row (predicate returns the row)
 *   stranger  → some other memberId (predicate filters the row out → 404)
 *   anonymous → getAuthedUser() returns null (publicOnly predicate)
 */

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));
jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@/lib/auth-helpers', () => ({
  getUserRole: jest.fn(() => 'member'),
  canEditEvent: jest.fn(() => false),
  canDeleteEvent: jest.fn(() => false),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/db/to-display-event', () => ({
  dbEventToDisplayEvent: (e: unknown) => e,
}));
jest.mock('@/lib/events/visibility', () => ({
  visibleEventsForMemberCondition: jest.fn((memberId: number) => ({ __visibilityCond: 'member', memberId })),
  publicOnlyEventsCondition: jest.fn(() => ({ __visibilityCond: 'public' })),
}));
jest.mock('@/lib/notifications/fanout', () => ({
  diffEventForNotification: jest.fn(),
  fanoutEventChanged: jest.fn(),
  fanoutEventCancelled: jest.fn(),
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { visibleEventsForMemberCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';
import { GET } from '@/app/api/events/[id]/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;
const mockVisibleForMember = visibleEventsForMemberCondition as unknown as jest.Mock;
const mockPublicOnly = publicOnlyEventsCondition as unknown as jest.Mock;

// ─── Persona helper ──────────────────────────────────────────────────────────

/**
 * Build an AuthedUser with the given canonical memberId. Other fields are the
 * minimal shape the GET route reads (id, role, name, image).
 */
function authedMember(memberId: number, id = `provider-${memberId}`) {
  return {
    memberId,
    id,
    role: 'member' as const,
    name: null,
    image: null,
  };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Sets up select mock for the event lookup (first call) + rsvps (second call).
 * eventRow: the row returned by the visibility-filtered event query (or null for
 * no match — i.e. the predicate filtered the private event out for this caller).
 */
function setupSelectMock(eventRow: unknown | null) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };

  let callCount = 0;
  dbModule.db.select = () => {
    callCount++;
    if (callCount === 1) {
      // First call: event lookup with visibility filter
      return {
        from: () => ({
          where: () => Promise.resolve(eventRow ? [eventRow] : []),
        }),
      };
    }
    // Second call: rsvps fetch
    return {
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    };
  };
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(): import('next/server').NextRequest {
  return {} as unknown as import('next/server').NextRequest;
}

// ─── GET /api/events/[id] — visibility filtering ─────────────────────────────

describe('GET /api/events/[id] — visibility filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when private event and caller has no relationship (unauthenticated)', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    // DB returns no rows — publicOnly predicate filtered out the private event
    setupSelectMock(null);

    const res = await GET(makeRequest(), makeParams('1'));

    expect(res.status).toBe(404);
    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForMember).not.toHaveBeenCalled();
  });

  it('returns 404 when private event and authenticated caller has no relationship (stranger)', async () => {
    // Stranger: a memberId that is neither creator/rsvp/invited for the event.
    mockGetAuthedUser.mockResolvedValue(authedMember(777));
    // DB returns no rows — member predicate filtered the private event out
    setupSelectMock(null);

    const res = await GET(makeRequest(), makeParams('5'));

    expect(res.status).toBe(404);
    expect(mockVisibleForMember).toHaveBeenCalledWith(777);
    expect(mockPublicOnly).not.toHaveBeenCalled();
  });

  it('returns 200 for a public event (unauthenticated caller)', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    const publicEvent = { id: 10, visibility: 'public', title: 'Open Gathering', memberId: 99 };
    setupSelectMock(publicEvent);

    const res = await GET(makeRequest(), makeParams('10'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 10, visibility: 'public' });
    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForMember).not.toHaveBeenCalled();
  });

  it('returns 200 when caller is the event creator', async () => {
    // Creator: authed.memberId === event.memberId. The member predicate's
    // `events.member_id = memberId` branch returns the row.
    mockGetAuthedUser.mockResolvedValue(authedMember(101));
    const privateEvent = { id: 20, visibility: 'private', title: 'My Private Event', memberId: 101 };
    setupSelectMock(privateEvent);

    const res = await GET(makeRequest(), makeParams('20'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 20 });
    expect(mockVisibleForMember).toHaveBeenCalledWith(101);
  });

  it('returns 200 when caller has an invitation row', async () => {
    // Invited: memberId present in event_invitations. The member predicate's
    // invitation EXISTS branch returns the row even though member_id != event's.
    mockGetAuthedUser.mockResolvedValue(authedMember(202));
    const privateEvent = { id: 30, visibility: 'private', title: 'Invite-Only Event', memberId: 5 };
    setupSelectMock(privateEvent);

    const res = await GET(makeRequest(), makeParams('30'));

    expect(res.status).toBe(200);
    expect(mockVisibleForMember).toHaveBeenCalledWith(202);
  });

  it('returns 200 when caller has an RSVP', async () => {
    // RSVP'd: memberId with an rsvps row. The member predicate's rsvps EXISTS
    // branch returns the row.
    mockGetAuthedUser.mockResolvedValue(authedMember(303));
    const privateEvent = { id: 40, visibility: 'private', title: 'RSVP Event', memberId: 5 };
    setupSelectMock(privateEvent);

    const res = await GET(makeRequest(), makeParams('40'));

    expect(res.status).toBe(200);
    expect(mockVisibleForMember).toHaveBeenCalledWith(303);
  });

  it('uses publicOnlyEventsCondition when no session', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    setupSelectMock(null);

    await GET(makeRequest(), makeParams('99'));

    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForMember).not.toHaveBeenCalled();
  });

  it('uses publicOnlyEventsCondition when authed user has no resolved memberId', async () => {
    // Authenticated but memberId === null (provider identity not yet linked to a
    // member row): the route falls back to the public-only predicate.
    mockGetAuthedUser.mockResolvedValue({
      memberId: null,
      id: 'provider-unlinked',
      role: 'member' as const,
      name: null,
      image: null,
    });
    setupSelectMock({ id: 50, visibility: 'public', memberId: 9 });

    const res = await GET(makeRequest(), makeParams('50'));

    expect(res.status).toBe(200);
    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForMember).not.toHaveBeenCalled();
  });

  it('returns 400 for non-numeric id', async () => {
    mockGetAuthedUser.mockResolvedValue(null);

    const res = await GET(makeRequest(), makeParams('abc'));

    expect(res.status).toBe(400);
  });
});
