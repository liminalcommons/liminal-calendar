/**
 * @jest-environment node
 *
 * Tests for Plan 2 Task 3: wiring invitations into POST /api/events
 * with cap enforcement (approach b — validate before insert).
 */

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));
jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetUserRole: jest.Mock<any, any[]> = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCanCreateEvents: jest.Mock<any, any[]> = jest.fn(() => true);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCanCreatePublicEvent: jest.Mock<any, any[]> = jest.fn(() => true);

jest.mock('@/lib/auth-helpers', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUserRole: (arg: any) => mockGetUserRole(arg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canCreateEvents: (arg: any) => mockCanCreateEvents(arg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canCreatePublicEvent: (arg: any) => mockCanCreatePublicEvent(arg),
}));

jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

jest.mock('@/lib/db/to-display-event', () => ({
  dbEventToDisplayEvent: (e: unknown) => ({ id: 99, src: e }),
}));

jest.mock('@/lib/events/create-event-input', () => ({
  validateCreateEventInput: jest.fn(() => ({
    ok: true,
    value: {
      title: 'Test Event',
      description: 'desc',
      startDate: new Date('2026-07-01T18:00:00Z'),
      endDate: new Date('2026-07-01T19:00:00Z'),
      timezone: 'UTC',
      location: null,
      imageUrl: null,
      recurrenceRule: null,
      visibility: 'public',
    },
  })),
}));

// Mock invitations-repo — we want to spy on both functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockValidateInviteeCap: jest.Mock<any, any[]> = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSetEventInvitations: jest.Mock<any, any[]> = jest.fn();

jest.mock('@/lib/events/invitations-repo', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validateInviteeCap: (arg: any) => mockValidateInviteeCap(arg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setEventInvitations: (arg: any) => mockSetEventInvitations(arg),
  INVITEE_CAP_MEMBER: 10,
}));

import { auth } from '../../../auth';
import { POST } from '@/app/api/events/route';

const mockAuth = auth as unknown as jest.Mock;

function setupInsertMock(returnedRow: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  dbModule.db.insert = jest.fn(() => ({
    values: () => ({
      returning: () => Promise.resolve([returnedRow]),
    }),
  }));
  return dbModule.db.insert as jest.Mock;
}

function makeReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest;
}

const BASE_BODY = {
  title: 'Test Event',
  startDate: '2026-07-01T18:00:00Z',
  endDate: '2026-07-01T19:00:00Z',
  timezone: 'UTC',
};

const MOCK_EVENT_ROW = {
  id: 42,
  title: 'Test Event',
  startsAt: new Date('2026-07-01T18:00:00Z'),
};

function makeInvitees(count: number, prefix = 'user') {
  return Array.from({ length: count }, (_, i) => ({
    userId: `${prefix}-${i + 1}`,
    name: `User ${i + 1}`,
    image: null,
  }));
}

describe('POST /api/events — invitations cap enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { hyloId: '69147', id: '69147', name: 'Tester', image: null },
    });
    mockValidateInviteeCap.mockImplementation(
      ({ invitees }: { organizerRole: string; invitees: unknown[] }) => {
        // Mirror real impl: dedupe by userId
        const seen = new Map();
        for (const inv of invitees as Array<{ userId: string }>) {
          seen.set(inv.userId, inv);
        }
        return Array.from(seen.values());
      },
    );
    mockSetEventInvitations.mockResolvedValue(undefined);
  });

  // ── Test 1: member + 11 invitees → 400, NO event row inserted ───────────
  it('returns 400 and skips db.insert when member exceeds 10-invitee cap', async () => {
    mockGetUserRole.mockReturnValue('member');
    // Cap check throws before insert
    mockValidateInviteeCap.mockImplementation(() => {
      throw new Error('INVITEE_CAP_EXCEEDED');
    });

    const insertMock = setupInsertMock(MOCK_EVENT_ROW);

    const res = await POST(
      makeReq({ ...BASE_BODY, invitees: makeInvitees(11) }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/cap exceeded/i);

    // Critical: event row must NOT have been inserted
    expect(insertMock).not.toHaveBeenCalled();
  });

  // ── Test 2: member + 10 invitees → 200, event created, invitations wired ─
  it('creates event and calls setEventInvitations for member with exactly 10 invitees', async () => {
    mockGetUserRole.mockReturnValue('member');
    const invitees = makeInvitees(10);
    mockValidateInviteeCap.mockReturnValue(invitees); // returns deduped list

    setupInsertMock(MOCK_EVENT_ROW);

    const res = await POST(makeReq({ ...BASE_BODY, invitees }));

    expect(res.status).toBe(201);
    expect(mockSetEventInvitations).toHaveBeenCalledTimes(1);
    expect(mockSetEventInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 42, organizerRole: 'member' }),
    );
  });

  // ── Test 3: host + 50 invitees → 200 ────────────────────────────────────
  it('creates event + invitations for host with 50 invitees (no cap)', async () => {
    mockGetUserRole.mockReturnValue('host');
    const invitees = makeInvitees(50);
    mockValidateInviteeCap.mockReturnValue(invitees);

    setupInsertMock(MOCK_EVENT_ROW);

    const res = await POST(makeReq({ ...BASE_BODY, invitees }));

    expect(res.status).toBe(201);
    expect(mockSetEventInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 42, organizerRole: 'host' }),
    );
    const callArgs = mockSetEventInvitations.mock.calls[0][0];
    expect(callArgs.invitees).toHaveLength(50);
  });

  // ── Test 4: no invitees → 200, existing behavior preserved ──────────────
  it('creates event normally when no invitees provided', async () => {
    mockGetUserRole.mockReturnValue('admin');
    setupInsertMock(MOCK_EVENT_ROW);

    const res = await POST(makeReq(BASE_BODY));

    expect(res.status).toBe(201);
    expect(mockSetEventInvitations).not.toHaveBeenCalled();
    expect(mockValidateInviteeCap).not.toHaveBeenCalled();
  });

  // ── Test 5: duplicate userIds deduplicated (12 raw → 10 unique) → 200 ───
  it('accepts 12 raw invitees that dedupe to 10 unique userIds for member', async () => {
    mockGetUserRole.mockReturnValue('member');

    // 10 unique + 2 dupes of user-1 and user-2
    const invitees = [
      ...makeInvitees(10),
      { userId: 'user-1', name: 'User 1 dupe', image: null },
      { userId: 'user-2', name: 'User 2 dupe', image: null },
    ];

    // Real dedupe: 10 unique
    const deduped = makeInvitees(10);
    mockValidateInviteeCap.mockReturnValue(deduped);

    setupInsertMock(MOCK_EVENT_ROW);

    const res = await POST(makeReq({ ...BASE_BODY, invitees }));

    expect(res.status).toBe(201);
    expect(mockSetEventInvitations).toHaveBeenCalledTimes(1);
    const callArgs = mockSetEventInvitations.mock.calls[0][0];
    expect(callArgs.invitees).toHaveLength(10);
  });
});

// ── Unit tests for validateInviteeCap (pure function, no DB) ─────────────────
describe('validateInviteeCap (unit)', () => {
  // Import the REAL implementation for unit testing
  let realValidate: typeof import('@/lib/events/invitations-repo').validateInviteeCap;

  beforeAll(async () => {
    jest.unmock('@/lib/events/invitations-repo');
    // dynamic require after unmock
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/events/invitations-repo');
    realValidate = mod.validateInviteeCap;
  });

  it('dedupes by userId and returns unique list', () => {
    const invitees = [
      { userId: 'a', name: 'A' },
      { userId: 'b', name: 'B' },
      { userId: 'a', name: 'A2' }, // dupe → last wins
    ];
    const result = realValidate({ organizerRole: 'admin', invitees });
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.userId === 'a')?.name).toBe('A2');
  });

  it('throws INVITEE_CAP_EXCEEDED for member with 11 unique invitees', () => {
    const invitees = makeInvitees(11);
    expect(() => realValidate({ organizerRole: 'member', invitees })).toThrow(
      'INVITEE_CAP_EXCEEDED',
    );
  });

  it('does NOT throw for member with exactly 10 unique invitees', () => {
    const invitees = makeInvitees(10);
    expect(() => realValidate({ organizerRole: 'member', invitees })).not.toThrow();
  });

  it('does NOT throw for host with 50 invitees', () => {
    const invitees = makeInvitees(50);
    expect(() => realValidate({ organizerRole: 'host', invitees })).not.toThrow();
  });

  it('does NOT throw for admin with 50 invitees', () => {
    const invitees = makeInvitees(50);
    expect(() => realValidate({ organizerRole: 'admin', invitees })).not.toThrow();
  });
});
