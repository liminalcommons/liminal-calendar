/**
 * @jest-environment node
 *
 * Tests for Plan 2 Task 4:
 *   A. GET /api/events/[id]/invitations
 *   B. PATCH /api/events/[id] with optional `invitees` field
 *
 * Identity model: routes resolve the caller via `getAuthedUser()`
 * (@/lib/auth/get-authed-user), which returns an `AuthedUser`:
 *   { memberId: number|null, id, role: 'member'|'host'|'admin', name, image, ... }
 * Ownership/creator is `event.memberId === authed.memberId`. There is no
 * `hyloId` anywhere — Hylo was removed. Each auth mock below therefore sets
 * `memberId` (the canonical integer FK) rather than a provider string.
 */

// ── Shared mocks ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetAuthedUser: jest.Mock<any, any[]> = jest.fn();

jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: () => mockGetAuthedUser(),
}));

jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

jest.mock('@/lib/db/to-display-event', () => ({
  dbEventToDisplayEvent: (e: unknown) => ({ id: (e as { id: number }).id, _mock: true }),
}));

jest.mock('@/lib/cache/revalidate-calendar-views', () => ({
  revalidateCalendarViews: jest.fn(),
}));

jest.mock('@/lib/notifications/fanout', () => ({
  diffEventForNotification: jest.fn(() => null),
  fanoutEventChanged: jest.fn(),
  fanoutEventCancelled: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVisibleCondition = { _sql: 'visible' } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPublicCondition = { _sql: 'public' } as any;

jest.mock('@/lib/events/visibility', () => ({
  visibleEventsForMemberCondition: jest.fn(() => mockVisibleCondition),
  publicOnlyEventsCondition: jest.fn(() => mockPublicCondition),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockValidateInviteeCap: jest.Mock<any, any[]> = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSetEventInvitations: jest.Mock<any, any[]> = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListEventInvitations: jest.Mock<any, any[]> = jest.fn();

jest.mock('@/lib/events/invitations-repo', () => ({
  INVITEE_CAP_MEMBER: 10,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validateInviteeCap: (arg: any) => mockValidateInviteeCap(arg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setEventInvitations: (arg: any) => mockSetEventInvitations(arg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listEventInvitations: (arg: any) => mockListEventInvitations(arg),
}));

import { GET as getInvitations } from '@/app/api/events/[id]/invitations/route';
import { PATCH } from '@/app/api/events/[id]/route';
import type { AuthedUser } from '@/lib/auth/get-authed-user';

// ── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Build an AuthedUser. `memberId` is the canonical integer identity the routes
 * compare against `event.memberId` for ownership; `id` is the provider string
 * surfaced to display-event projection. Both are set consistently.
 */
function authedUser(
  memberId: number,
  role: AuthedUser['role'] = 'member',
): AuthedUser {
  return {
    memberId,
    id: `logto-${memberId}`,
    role,
    name: `Member ${memberId}`,
    image: null,
    logtoUserId: `logto-${memberId}`,
    email: null,
  };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function getDbModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/db') as { db: Record<string, unknown> };
}

function setupEventVisible(eventRow: unknown) {
  const dbModule = getDbModule();
  dbModule.db.select = jest.fn(() => ({
    from: () => ({
      where: () => Promise.resolve([eventRow]),
    }),
  }));
}

function setupEventNotVisible() {
  const dbModule = getDbModule();
  dbModule.db.select = jest.fn(() => ({
    from: () => ({
      where: () => Promise.resolve([]),
    }),
  }));
}

function setupPatchDbMocks(eventRow: unknown) {
  const dbModule = getDbModule();
  dbModule.db.select = jest.fn(() => ({
    from: () => ({
      where: () => Promise.resolve([eventRow]),
    }),
  }));
  dbModule.db.update = jest.fn(() => ({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([eventRow]),
      }),
    }),
  }));
}

function makeReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest;
}

const params42 = { params: Promise.resolve({ id: '42' }) };

function makeInvitees(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    userId: `user-${i + 1}`,
    name: `User ${i + 1}`,
    image: null,
  }));
}

// ── Shared event row ──────────────────────────────────────────────────────────

// The event's owner — ownership is `event.memberId === authed.memberId`.
const CREATOR_MEMBER_ID = 99;
const BASE_EVENT = {
  id: 42,
  memberId: CREATOR_MEMBER_ID,
  title: 'Test Event',
  startsAt: new Date('2026-07-01T18:00:00Z'),
  endsAt: new Date('2026-07-01T19:00:00Z'),
  visibility: 'private',
  cancelledByMemberId: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// A. GET /api/events/[id]/invitations
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/events/[id]/invitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListEventInvitations.mockResolvedValue([]);
  });

  // Test 1: Unauthed → 401
  it('returns 401 when unauthenticated', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    const res = await getInvitations(
      {} as import('next/server').NextRequest,
      params42,
    );
    expect(res.status).toBe(401);
  });

  // Test 2: Event not visible → 404
  it('returns 404 when event not visible to user', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser(1));
    setupEventNotVisible();

    const res = await getInvitations(
      {} as import('next/server').NextRequest,
      params42,
    );
    expect(res.status).toBe(404);
  });

  // Test 3: Event visible (creator) → 200 with invitation list
  it('returns 200 with invitation list when event is visible to creator', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser(CREATOR_MEMBER_ID));
    setupEventVisible(BASE_EVENT);

    const invitations = [
      {
        inviteeUserId: 'user-1',
        inviteeName: 'User One',
        inviteeImage: null,
        invitedAt: new Date('2026-07-01'),
      },
    ];
    mockListEventInvitations.mockResolvedValue(invitations);

    const res = await getInvitations(
      {} as import('next/server').NextRequest,
      params42,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0].inviteeUserId).toBe('user-1');
  });

  // Test 4: Event visible via existing invitation row → 200
  it('returns 200 when event is visible because user is an invitee', async () => {
    // A non-creator member whose visibility comes from an invitation row.
    // The DB visibility condition (mocked here) is what grants access; the
    // route just needs a positive memberId to take the member-visibility path.
    mockGetAuthedUser.mockResolvedValue(authedUser(7));
    setupEventVisible(BASE_EVENT);

    mockListEventInvitations.mockResolvedValue([
      {
        inviteeUserId: 'logto-7',
        inviteeName: 'Invitee',
        inviteeImage: null,
        invitedAt: null,
      },
    ]);

    const res = await getInvitations(
      {} as import('next/server').NextRequest,
      params42,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitations).toHaveLength(1);
  });

  // Test 5: Empty list → returns { invitations: [] }
  it('returns empty array when there are no invitations', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser(CREATOR_MEMBER_ID));
    setupEventVisible(BASE_EVENT);
    mockListEventInvitations.mockResolvedValue([]);

    const res = await getInvitations(
      {} as import('next/server').NextRequest,
      params42,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. PATCH /api/events/[id] with invitees
//
// Invitation-edit authz (route): `wantsInvitationEdit && !isCreator &&
// role !== 'admin'` → 403. i.e. the event creator (ANY role, members
// included) OR an admin may edit invitations. Field-only edits go through
// canEditEvent(role, isCreator) === isCreator. The cap is enforced by
// validateInviteeCap({ organizerRole: authed.role, ... }).
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/events/[id] — invitees editing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetEventInvitations.mockResolvedValue(undefined);
  });

  // Test 6: Non-creator non-admin → 403
  it('returns 403 for non-creator non-admin trying to edit invitations', async () => {
    // A stranger member (memberId 12 ≠ creator 99), role member → not creator,
    // not admin → invitation edit forbidden.
    mockGetAuthedUser.mockResolvedValue(authedUser(12, 'member'));
    setupPatchDbMocks(BASE_EVENT);

    const res = await PATCH(
      makeReq({ invitees: makeInvitees(3) }),
      params42,
    );
    expect(res.status).toBe(403);
    expect(mockSetEventInvitations).not.toHaveBeenCalled();
  });

  // Test 7: Creator (member) + 11 invitees → 400, invitations unchanged
  it('returns 400 for member creator with 11 invitees (cap exceeded)', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser(CREATOR_MEMBER_ID, 'member'));
    setupPatchDbMocks(BASE_EVENT);
    mockValidateInviteeCap.mockImplementation(() => {
      throw new Error('INVITEE_CAP_EXCEEDED');
    });

    const res = await PATCH(
      makeReq({ invitees: makeInvitees(11) }),
      params42,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cap exceeded/i);
    expect(mockSetEventInvitations).not.toHaveBeenCalled();
  });

  // Test 8: Creator (member) + 10 → 200
  it('returns 200 for member creator with exactly 10 invitees', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser(CREATOR_MEMBER_ID, 'member'));
    setupPatchDbMocks(BASE_EVENT);
    const invitees = makeInvitees(10);
    mockValidateInviteeCap.mockReturnValue(invitees);

    const res = await PATCH(
      makeReq({ invitees }),
      params42,
    );
    expect(res.status).toBe(200);
    expect(mockSetEventInvitations).toHaveBeenCalledTimes(1);
    expect(mockSetEventInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 42, organizerRole: 'member' }),
    );
  });

  // Test 9: Creator (host) + 50 → 200
  it('returns 200 for host creator with 50 invitees (no cap)', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser(CREATOR_MEMBER_ID, 'host'));
    setupPatchDbMocks(BASE_EVENT);
    const invitees = makeInvitees(50);
    mockValidateInviteeCap.mockReturnValue(invitees);

    const res = await PATCH(
      makeReq({ invitees }),
      params42,
    );
    expect(res.status).toBe(200);
    expect(mockSetEventInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 42, organizerRole: 'host', invitees }),
    );
  });

  // Test 10: Admin (not creator) + 30 → 200
  it('returns 200 for admin (not creator) with 30 invitees', async () => {
    // memberId 5 ≠ creator 99, but role admin → invitation edit allowed.
    mockGetAuthedUser.mockResolvedValue(authedUser(5, 'admin'));
    setupPatchDbMocks(BASE_EVENT);
    const invitees = makeInvitees(30);
    mockValidateInviteeCap.mockReturnValue(invitees);

    const res = await PATCH(
      makeReq({ invitees }),
      params42,
    );
    expect(res.status).toBe(200);
    expect(mockSetEventInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 42, organizerRole: 'admin' }),
    );
  });

  // Test 11: PATCH without `invitees` key → existing fields update, invitations untouched
  it('does not touch invitations when invitees key is absent', async () => {
    // Host creator may edit fields (canEditEvent === isCreator).
    mockGetAuthedUser.mockResolvedValue(authedUser(CREATOR_MEMBER_ID, 'host'));
    setupPatchDbMocks(BASE_EVENT);

    const res = await PATCH(
      makeReq({ title: 'Updated Title' }),
      params42,
    );
    expect(res.status).toBe(200);
    expect(mockSetEventInvitations).not.toHaveBeenCalled();
    expect(mockValidateInviteeCap).not.toHaveBeenCalled();
  });

  // Test 12: PATCH with `invitees: []` → all invitations cleared
  it('clears all invitations when invitees is an explicit empty array', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser(CREATOR_MEMBER_ID, 'host'));
    setupPatchDbMocks(BASE_EVENT);
    mockValidateInviteeCap.mockReturnValue([]); // empty after dedupe

    const res = await PATCH(
      makeReq({ invitees: [] }),
      params42,
    );
    expect(res.status).toBe(200);
    expect(mockSetEventInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 42, invitees: [] }),
    );
  });
});
