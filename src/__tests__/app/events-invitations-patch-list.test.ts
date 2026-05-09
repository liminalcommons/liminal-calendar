/**
 * @jest-environment node
 *
 * Tests for Plan 2 Task 4:
 *   A. GET /api/events/[id]/invitations
 *   B. PATCH /api/events/[id] with optional `invitees` field
 */

// ── Shared mocks ──────────────────────────────────────────────────────────────

jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

jest.mock('@/lib/db/to-display-event', () => ({
  dbEventToDisplayEvent: (e: unknown) => ({ id: (e as { id: number }).id, _mock: true }),
}));

jest.mock('@/lib/notifications/fanout', () => ({
  diffEventForNotification: jest.fn(() => null),
  fanoutEventChanged: jest.fn(),
  fanoutEventCancelled: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetUserRole: jest.Mock<any, any[]> = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCanEditEvent: jest.Mock<any, any[]> = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCanDeleteEvent: jest.Mock<any, any[]> = jest.fn(() => false);

jest.mock('@/lib/auth-helpers', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUserRole: (arg: any) => mockGetUserRole(arg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canEditEvent: (role: any, isCreator: any) => mockCanEditEvent(role, isCreator),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canDeleteEvent: (role: any, isCreator: any) => mockCanDeleteEvent(role, isCreator),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVisibleCondition = { _sql: 'visible' } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPublicCondition = { _sql: 'public' } as any;

jest.mock('@/lib/events/visibility', () => ({
  visibleEventsForUserCondition: jest.fn(() => mockVisibleCondition),
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

import { auth } from '../../../auth';
import { GET as getInvitations } from '@/app/api/events/[id]/invitations/route';
import { PATCH } from '@/app/api/events/[id]/route';

const mockAuth = auth as unknown as jest.Mock;

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

const CREATOR_ID = 'creator-99';
const BASE_EVENT = {
  id: 42,
  creatorId: CREATOR_ID,
  title: 'Test Event',
  startsAt: new Date('2026-07-01T18:00:00Z'),
  endsAt: new Date('2026-07-01T19:00:00Z'),
  visibility: 'private',
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
    mockAuth.mockResolvedValue(null);
    const res = await getInvitations(
      {} as import('next/server').NextRequest,
      params42,
    );
    expect(res.status).toBe(401);
  });

  // Test 2: Event not visible → 404
  it('returns 404 when event not visible to user', async () => {
    mockAuth.mockResolvedValue({
      user: { hyloId: 'viewer-1', id: 'viewer-1' },
    });
    setupEventNotVisible();

    const res = await getInvitations(
      {} as import('next/server').NextRequest,
      params42,
    );
    expect(res.status).toBe(404);
  });

  // Test 3: Event visible (creator) → 200 with invitation list
  it('returns 200 with invitation list when event is visible to creator', async () => {
    mockAuth.mockResolvedValue({
      user: { hyloId: CREATOR_ID, id: CREATOR_ID },
    });
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
    mockAuth.mockResolvedValue({
      user: { hyloId: 'invitee-user', id: 'invitee-user' },
    });
    // The visibility condition includes invitation check — mock returns the event
    setupEventVisible(BASE_EVENT);

    mockListEventInvitations.mockResolvedValue([
      {
        inviteeUserId: 'invitee-user',
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
    mockAuth.mockResolvedValue({
      user: { hyloId: CREATOR_ID, id: CREATOR_ID },
    });
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
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/events/[id] — invitees editing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetEventInvitations.mockResolvedValue(undefined);
  });

  // Test 6: Non-creator non-admin → 403
  it('returns 403 for non-creator non-admin trying to edit invitations', async () => {
    mockAuth.mockResolvedValue({
      user: { hyloId: 'other-user', id: 'other-user' },
    });
    mockGetUserRole.mockReturnValue('member');
    mockCanEditEvent.mockReturnValue(false);
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
    mockAuth.mockResolvedValue({
      user: { hyloId: CREATOR_ID, id: CREATOR_ID },
    });
    mockGetUserRole.mockReturnValue('member');
    mockCanEditEvent.mockReturnValue(false); // member+creator → canEditEvent false (field edits blocked)
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
    mockAuth.mockResolvedValue({
      user: { hyloId: CREATOR_ID, id: CREATOR_ID },
    });
    mockGetUserRole.mockReturnValue('member');
    mockCanEditEvent.mockReturnValue(false);
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
    mockAuth.mockResolvedValue({
      user: { hyloId: CREATOR_ID, id: CREATOR_ID },
    });
    mockGetUserRole.mockReturnValue('host');
    mockCanEditEvent.mockReturnValue(true);
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
    mockAuth.mockResolvedValue({
      user: { hyloId: 'admin-user', id: 'admin-user' },
    });
    mockGetUserRole.mockReturnValue('admin');
    mockCanEditEvent.mockReturnValue(false); // admin is not creator here
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
    mockAuth.mockResolvedValue({
      user: { hyloId: CREATOR_ID, id: CREATOR_ID },
    });
    mockGetUserRole.mockReturnValue('host');
    mockCanEditEvent.mockReturnValue(true);
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
    mockAuth.mockResolvedValue({
      user: { hyloId: CREATOR_ID, id: CREATOR_ID },
    });
    mockGetUserRole.mockReturnValue('host');
    mockCanEditEvent.mockReturnValue(true);
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
