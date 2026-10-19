/**
 * @jest-environment node
 *
 * Tests for visibility filtering on GET /api/events and visibility tier
 * enforcement on POST /api/events.
 */

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));
jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@/lib/auth-helpers', () => ({
  getUserRole: jest.fn(() => 'member'),
  canCreateEvents: jest.fn(() => true),
  canCreatePublicEvent: jest.fn((role: string) => role === 'host' || role === 'admin'),
  canPublishToConference: jest.fn(() => true),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/db/to-display-event', () => ({
  dbEventToDisplayEvent: (e: unknown) => e,
}));
jest.mock('@/lib/events/create-event-input', () => ({
  validateCreateEventInput: jest.fn(),
}));
jest.mock('@/lib/events/invitations-repo', () => ({
  validateInviteeCap: jest.fn((args: { invitees: unknown[] }) => args.invitees),
  setEventInvitations: jest.fn(),
  INVITEE_CAP_MEMBER: 10,
}));
jest.mock('@/lib/events/visibility', () => ({
  visibleEventsForMemberCondition: jest.fn((memberId: number) => ({ __visibilityCond: 'member', memberId })),
  publicOnlyEventsCondition: jest.fn(() => ({ __visibilityCond: 'public' })),
  activeConferenceCondition: jest.fn(() => ({ __activeConferenceCond: true })),
  conferenceScopeCondition: jest.fn((conferenceId: number) => ({ __conferenceScope: conferenceId })),
}));
jest.mock('@/lib/events/conferences', () => ({
  getConferenceBySlug: jest.fn(),
  getConferenceById: jest.fn(),
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { getUserRole, canCreatePublicEvent, canPublishToConference } from '@/lib/auth-helpers';
import { visibleEventsForMemberCondition, publicOnlyEventsCondition, conferenceScopeCondition } from '@/lib/events/visibility';
import { getConferenceBySlug, getConferenceById } from '@/lib/events/conferences';
import { validateCreateEventInput } from '@/lib/events/create-event-input';
import { GET, POST } from '@/app/api/events/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;
const mockGetUserRole = getUserRole as unknown as jest.Mock;
const mockCanCreatePublicEvent = canCreatePublicEvent as unknown as jest.Mock;
const mockCanPublishToConference = canPublishToConference as unknown as jest.Mock;
const mockVisibleForMember = visibleEventsForMemberCondition as unknown as jest.Mock;
const mockPublicOnly = publicOnlyEventsCondition as unknown as jest.Mock;
const mockConferenceScope = conferenceScopeCondition as unknown as jest.Mock;
const mockGetConferenceBySlug = getConferenceBySlug as unknown as jest.Mock;
const mockGetConferenceById = getConferenceById as unknown as jest.Mock;
const mockValidateInput = validateCreateEventInput as unknown as jest.Mock;

// ─── DB helpers ──────────────────────────────────────────────────────────────

function setupSelectMock(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  // Capture the where() predicate for inspection in tests.
  let capturedWhere: unknown = null;
  dbModule.db.select = () => ({
    from: () => ({
      orderBy: () => ({
        limit: () => ({
          offset: () => ({
            where: (cond: unknown) => {
              capturedWhere = cond;
              return Promise.resolve(rows);
            },
          }),
        }),
      }),
    }),
  });
  // Also stub rsvps select used after main query (returns empty to keep it simple).
  // Overwrite select to return empty rsvps on second call.
  let callCount = 0;
  const originalSelect = dbModule.db.select as () => unknown;
  dbModule.db.select = () => {
    callCount++;
    if (callCount === 1) {
      return (originalSelect as () => unknown)();
    }
    // Second call: rsvps fetch — return empty.
    return {
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    };
  };
  return { getWhere: () => capturedWhere };
}

function setupInsertMock(returnedRow: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  let capturedValues: unknown = null;
  dbModule.db.insert = () => ({
    values: (vals: unknown) => {
      capturedValues = vals;
      return {
        returning: () => Promise.resolve([returnedRow]),
      };
    },
  });
  return { getValues: () => capturedValues };
}

function makeGetReq(params: Record<string, string> = {}): import('next/server').NextRequest {
  const url = new URL('http://localhost/api/events');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url: url.toString() } as unknown as import('next/server').NextRequest;
}

function makePostReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest;
}

// ─── GET /api/events — visibility filtering ──────────────────────────────────

describe('GET /api/events — visibility filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses publicOnlyEventsCondition when no user is signed in', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    setupSelectMock([]);

    await GET(makeGetReq());

    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForMember).not.toHaveBeenCalled();
  });

  it('uses visibleEventsForMemberCondition with memberId when user is signed in', async () => {
    mockGetAuthedUser.mockResolvedValue({ memberId: 42, id: 'h-42', role: 'member', name: null, image: null });
    setupSelectMock([]);

    await GET(makeGetReq());

    expect(mockVisibleForMember).toHaveBeenCalledWith(42);
    expect(mockPublicOnly).not.toHaveBeenCalled();
  });

  it('uses publicOnlyEventsCondition when authed user has no resolved memberId', async () => {
    // Authenticated session but no canonical members row yet (memberId null):
    // visibility falls back to public-only — private rows must not leak.
    mockGetAuthedUser.mockResolvedValue({ memberId: null, id: 'clerk_99', role: 'member', name: null, image: null });
    setupSelectMock([]);

    await GET(makeGetReq());

    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForMember).not.toHaveBeenCalled();
  });

  it('returns 200 with the rows returned by the DB (public event visible to stranger)', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    const publicEvent = { id: 1, visibility: 'public', title: 'Public Gathering' };
    setupSelectMock([publicEvent]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: 1 });
  });

  it('returns empty array when DB returns no rows (private event hidden from stranger)', async () => {
    // Stranger has no session; publicOnlyEventsCondition is applied.
    // The DB (mocked) returns no rows — simulating the predicate filtered them out.
    mockGetAuthedUser.mockResolvedValue(null);
    setupSelectMock([]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it('visibleEventsForMemberCondition is called for authenticated user (private event visible)', async () => {
    // Authenticated user: the visibility predicate includes creator/RSVP/invite logic.
    // The DB (mocked) returns the private event — simulating it matched the predicate.
    mockGetAuthedUser.mockResolvedValue({ memberId: 7, id: 'h-7', role: 'member', name: null, image: null });
    const privateEvent = { id: 2, visibility: 'private', title: 'Private Event' };
    setupSelectMock([privateEvent]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    expect(mockVisibleForMember).toHaveBeenCalledWith(7);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

// ─── POST /api/events — visibility field + tier enforcement ──────────────────

describe('POST /api/events — visibility', () => {
  const baseValidatedValue = {
    title: 'Test Event',
    description: null,
    startDate: new Date('2026-06-01T18:00:00Z'),
    endDate: new Date('2026-06-01T19:00:00Z'),
    timezone: 'UTC',
    location: null,
    imageUrl: null,
    recurrenceRule: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthedUser.mockResolvedValue({
      memberId: 1, id: 'h-1', name: 'Alice', image: null, role: 'member',
    });
  });

  it('defaults visibility to "private" when omitted from request body', async () => {
    mockGetUserRole.mockReturnValue('member');
    mockCanCreatePublicEvent.mockReturnValue(false);
    mockValidateInput.mockReturnValue({
      ok: true,
      value: { ...baseValidatedValue, visibility: 'private' },
    });
    const { getValues } = setupInsertMock({ id: 10, title: 'Test Event', startsAt: new Date() });

    const res = await POST(makePostReq({ title: 'Test Event', startTime: '2026-06-01T18:00:00Z', endTime: '2026-06-01T19:00:00Z' }));

    expect(res.status).toBe(201);
    expect((getValues() as Record<string, unknown>).visibility).toBe('private');
  });

  it('member can create a private event → 200 (201)', async () => {
    mockGetUserRole.mockReturnValue('member');
    mockCanCreatePublicEvent.mockReturnValue(false);
    mockValidateInput.mockReturnValue({
      ok: true,
      value: { ...baseValidatedValue, visibility: 'private' },
    });
    setupInsertMock({ id: 11, title: 'Test Event', startsAt: new Date() });

    const res = await POST(makePostReq({ title: 'Test Event', startTime: '2026-06-01T18:00:00Z', endTime: '2026-06-01T19:00:00Z', visibility: 'private' }));

    expect(res.status).toBe(201);
  });

  it('member POSTing visibility:"public" → 403', async () => {
    mockGetUserRole.mockReturnValue('member');
    mockCanCreatePublicEvent.mockReturnValue(false); // member cannot create public
    mockValidateInput.mockReturnValue({
      ok: true,
      value: { ...baseValidatedValue, visibility: 'public' },
    });

    const res = await POST(makePostReq({ title: 'Test Event', startTime: '2026-06-01T18:00:00Z', endTime: '2026-06-01T19:00:00Z', visibility: 'public' }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden/);
  });

  it('host POSTing visibility:"public" → 201', async () => {
    mockGetAuthedUser.mockResolvedValue({
      memberId: 2, id: 'h-2', name: 'Host User', image: null, role: 'host',
    });
    mockGetUserRole.mockReturnValue('host');
    mockCanCreatePublicEvent.mockReturnValue(true);
    mockValidateInput.mockReturnValue({
      ok: true,
      value: { ...baseValidatedValue, visibility: 'public' },
    });
    const { getValues } = setupInsertMock({ id: 12, title: 'Test Event', startsAt: new Date() });

    const res = await POST(makePostReq({ title: 'Test Event', startTime: '2026-06-01T18:00:00Z', endTime: '2026-06-01T19:00:00Z', visibility: 'public' }));

    expect(res.status).toBe(201);
    expect((getValues() as Record<string, unknown>).visibility).toBe('public');
  });

  it('admin POSTing visibility:"public" → 201', async () => {
    mockGetAuthedUser.mockResolvedValue({
      memberId: 3, id: 'h-3', name: 'Admin User', image: null, role: 'admin',
    });
    mockGetUserRole.mockReturnValue('admin');
    mockCanCreatePublicEvent.mockReturnValue(true);
    mockValidateInput.mockReturnValue({
      ok: true,
      value: { ...baseValidatedValue, visibility: 'public' },
    });
    setupInsertMock({ id: 13, title: 'Test Event', startsAt: new Date() });

    const res = await POST(makePostReq({ title: 'Test Event', startTime: '2026-06-01T18:00:00Z', endTime: '2026-06-01T19:00:00Z', visibility: 'public' }));

    expect(res.status).toBe(201);
  });

  it('validation failure returns 400 before any visibility check', async () => {
    mockValidateInput.mockReturnValue({
      ok: false,
      error: { error: 'title is required', status: 400 },
    });

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(400);
    expect(mockCanCreatePublicEvent).not.toHaveBeenCalled();
  });
});

// ─── validateCreateEventInput — visibility field ──────────────────────────────

describe('validateCreateEventInput — visibility field', () => {
  // Import the real validator (not mocked above — this describe block runs in
  // the same module scope as the mocks, but we test the real function directly
  // by importing it separately via jest.requireActual).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validateCreateEventInput: realValidate } = jest.requireActual(
    '@/lib/events/create-event-input',
  ) as typeof import('@/lib/events/create-event-input');

  const baseInput = {
    title: 'My Event',
    startTime: '2026-06-01T18:00:00Z',
    endTime: '2026-06-01T19:00:00Z',
  };

  it('defaults to "private" when visibility is omitted', () => {
    const result = realValidate(baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.visibility).toBe('private');
  });

  it('accepts "private" explicitly', () => {
    const result = realValidate({ ...baseInput, visibility: 'private' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.visibility).toBe('private');
  });

  it('accepts "public" explicitly', () => {
    const result = realValidate({ ...baseInput, visibility: 'public' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.visibility).toBe('public');
  });

  it('falls back to "private" for unrecognised visibility values', () => {
    const result = realValidate({ ...baseInput, visibility: 'secret' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.visibility).toBe('private');
  });

  it('accepts "members" explicitly (Limicon tier)', () => {
    const result = realValidate({ ...baseInput, visibility: 'members' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.visibility).toBe('members');
  });

  it('parses conference scope + category + retention flag', () => {
    const result = realValidate({
      ...baseInput,
      visibility: 'members',
      conferenceId: 9,
      continueBeyond: true,
      category: 'practice',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.conferenceId).toBe(9);
      expect(result.value.continueBeyond).toBe(true);
      expect(result.value.category).toBe('practice');
      expect(result.value.categoryOther).toBeNull();
    }
  });

  it('keeps free text only for "other" categories', () => {
    const other = realValidate({ ...baseInput, category: 'other', categoryOther: '  drum circle  ' });
    expect(other.ok).toBe(true);
    if (other.ok) {
      expect(other.value.category).toBe('other');
      expect(other.value.categoryOther).toBe('drum circle');
    }
    const speaker = realValidate({ ...baseInput, category: 'speaker', categoryOther: 'ignored' });
    expect(speaker.ok).toBe(true);
    if (speaker.ok) expect(speaker.value.categoryOther).toBeNull();
  });
});

// ─── GET /api/events — conference scope ─────────────────────────────────────

describe('GET /api/events — conference scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthedUser.mockResolvedValue({
      memberId: 7, id: 'h-7', name: 'M', image: null, role: 'member',
    });
  });

  it('unknown conference slug → 404', async () => {
    mockGetConferenceBySlug.mockResolvedValue(null);
    setupSelectMock([]);

    const res = await GET(makeGetReq({ conference: 'nope' }));

    expect(res.status).toBe(404);
    expect(mockGetConferenceBySlug).toHaveBeenCalledWith('nope');
  });

  it('known conference applies the scope condition', async () => {
    mockGetConferenceBySlug.mockResolvedValue({ id: 9, slug: 'limicon1', status: 'active' });
    setupSelectMock([]);

    const res = await GET(makeGetReq({ conference: 'limicon1' }));

    expect(res.status).toBe(200);
    expect(mockConferenceScope).toHaveBeenCalledWith(9);
  });
});

// ─── POST /api/events — Limicon publishing ──────────────────────────────────

describe('POST /api/events — Limicon conference publishing', () => {
  const baseValidatedValue = {
    title: 'Limicon Event',
    description: null,
    startDate: new Date('2026-10-05T18:00:00Z'),
    endDate: new Date('2026-10-05T19:00:00Z'),
    timezone: 'UTC',
    location: null,
    imageUrl: null,
    recurrenceRule: null,
    conferenceId: null as number | null,
    continueBeyond: false,
    category: null as string | null,
    categoryOther: null as string | null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthedUser.mockResolvedValue({
      memberId: 1, id: 'h-1', name: 'Alice', image: null, role: 'member',
    });
  });

  it('members-tier without a conference → 400', async () => {
    mockValidateInput.mockReturnValue({
      ok: true,
      value: { ...baseValidatedValue, visibility: 'members', conferenceId: null },
    });

    const res = await POST(makePostReq({ title: 'x', visibility: 'members' }));

    expect(res.status).toBe(400);
  });

  it('member publishing into an active conference → 201 with scope columns', async () => {
    mockGetConferenceById.mockResolvedValue({ id: 9, slug: 'limicon1', status: 'active' });
    mockCanPublishToConference.mockReturnValue(true);
    mockValidateInput.mockReturnValue({
      ok: true,
      value: {
        ...baseValidatedValue,
        visibility: 'members',
        conferenceId: 9,
        continueBeyond: true,
        category: 'practice',
      },
    });
    const { getValues } = setupInsertMock({ id: 20, title: 'Limicon Event', startsAt: new Date() });

    const res = await POST(makePostReq({ title: 'x', visibility: 'members', conferenceId: 9 }));

    expect(res.status).toBe(201);
    const vals = getValues() as Record<string, unknown>;
    expect(vals.conferenceId).toBe(9);
    expect(vals.continueBeyond).toBe(true);
    expect(vals.category).toBe('practice');
  });

  it('publishing into a non-accepting conference → 403', async () => {
    mockGetConferenceById.mockResolvedValue({ id: 9, slug: 'limicon1', status: 'ended' });
    mockCanPublishToConference.mockReturnValue(false);
    mockValidateInput.mockReturnValue({
      ok: true,
      value: { ...baseValidatedValue, visibility: 'members', conferenceId: 9 },
    });

    const res = await POST(makePostReq({ title: 'x', visibility: 'members', conferenceId: 9 }));

    expect(res.status).toBe(403);
  });

  it('unknown conference id → 400', async () => {
    mockGetConferenceById.mockResolvedValue(null);
    mockValidateInput.mockReturnValue({
      ok: true,
      value: { ...baseValidatedValue, visibility: 'members', conferenceId: 999 },
    });

    const res = await POST(makePostReq({ title: 'x', visibility: 'members', conferenceId: 999 }));

    expect(res.status).toBe(400);
  });
});
