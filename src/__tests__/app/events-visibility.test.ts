/**
 * @jest-environment node
 *
 * Tests for visibility filtering on GET /api/events and visibility tier
 * enforcement on POST /api/events.
 */

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));
jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));
jest.mock('@/lib/auth-helpers', () => ({
  getUserRole: jest.fn(() => 'member'),
  canCreateEvents: jest.fn(() => true),
  canCreatePublicEvent: jest.fn((role: string) => role === 'host' || role === 'admin'),
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
jest.mock('@/lib/events/visibility', () => ({
  visibleEventsForUserCondition: jest.fn((userId: string) => ({ __visibilityCond: 'user', userId })),
  publicOnlyEventsCondition: jest.fn(() => ({ __visibilityCond: 'public' })),
}));

import { auth } from '../../../auth';
import { getUserRole, canCreatePublicEvent } from '@/lib/auth-helpers';
import { visibleEventsForUserCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';
import { validateCreateEventInput } from '@/lib/events/create-event-input';
import { GET, POST } from '@/app/api/events/route';

const mockAuth = auth as unknown as jest.Mock;
const mockGetUserRole = getUserRole as unknown as jest.Mock;
const mockCanCreatePublicEvent = canCreatePublicEvent as unknown as jest.Mock;
const mockVisibleForUser = visibleEventsForUserCondition as unknown as jest.Mock;
const mockPublicOnly = publicOnlyEventsCondition as unknown as jest.Mock;
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
    mockAuth.mockResolvedValue(null);
    setupSelectMock([]);

    await GET(makeGetReq());

    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForUser).not.toHaveBeenCalled();
  });

  it('uses visibleEventsForUserCondition with hyloId when user is signed in', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-42', clerkId: null } });
    setupSelectMock([]);

    await GET(makeGetReq());

    expect(mockVisibleForUser).toHaveBeenCalledWith('h-42');
    expect(mockPublicOnly).not.toHaveBeenCalled();
  });

  it('falls back to clerkId when hyloId is absent', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: null, clerkId: 'clerk_99' } });
    setupSelectMock([]);

    await GET(makeGetReq());

    expect(mockVisibleForUser).toHaveBeenCalledWith('clerk_99');
    expect(mockPublicOnly).not.toHaveBeenCalled();
  });

  it('returns 200 with the rows returned by the DB (public event visible to stranger)', async () => {
    mockAuth.mockResolvedValue(null);
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
    mockAuth.mockResolvedValue(null);
    setupSelectMock([]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it('visibleEventsForUserCondition is called for authenticated user (private event visible)', async () => {
    // Authenticated user: the visibility predicate includes creator/RSVP/invite logic.
    // The DB (mocked) returns the private event — simulating it matched the predicate.
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-7', clerkId: null } });
    const privateEvent = { id: 2, visibility: 'private', title: 'Private Event' };
    setupSelectMock([privateEvent]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    expect(mockVisibleForUser).toHaveBeenCalledWith('h-7');
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
    mockAuth.mockResolvedValue({
      user: { hyloId: 'h-1', id: 'h-1', name: 'Alice', image: null, role: 'member' },
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
    mockAuth.mockResolvedValue({
      user: { hyloId: 'h-2', id: 'h-2', name: 'Host User', image: null, role: 'host' },
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
    mockAuth.mockResolvedValue({
      user: { hyloId: 'h-3', id: 'h-3', name: 'Admin User', image: null, role: 'admin' },
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
});
