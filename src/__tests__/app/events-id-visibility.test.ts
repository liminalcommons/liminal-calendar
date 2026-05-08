/**
 * @jest-environment node
 *
 * Tests for visibility filtering on GET /api/events/[id].
 * Private event returns 404 when caller has no relationship.
 */

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));
jest.mock('../../../auth', () => ({
  auth: jest.fn(),
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
  visibleEventsForUserCondition: jest.fn((userId: string) => ({ __visibilityCond: 'user', userId })),
  publicOnlyEventsCondition: jest.fn(() => ({ __visibilityCond: 'public' })),
}));
jest.mock('@/lib/notifications/fanout', () => ({
  diffEventForNotification: jest.fn(),
  fanoutEventChanged: jest.fn(),
  fanoutEventCancelled: jest.fn(),
}));

import { auth } from '../../../auth';
import { visibleEventsForUserCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';
import { GET } from '@/app/api/events/[id]/route';

const mockAuth = auth as unknown as jest.Mock;
const mockVisibleForUser = visibleEventsForUserCondition as unknown as jest.Mock;
const mockPublicOnly = publicOnlyEventsCondition as unknown as jest.Mock;

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Sets up select mock for the event lookup (first call) + rsvps (second call).
 * eventRow: the row returned by the visibility-filtered event query (or null for no match).
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
    mockAuth.mockResolvedValue(null);
    // DB returns no rows — visibility predicate filtered out the private event
    setupSelectMock(null);

    const res = await GET(makeRequest(), makeParams('1'));

    expect(res.status).toBe(404);
    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForUser).not.toHaveBeenCalled();
  });

  it('returns 404 when private event and authenticated caller has no relationship', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-stranger', clerkId: null } });
    // DB returns no rows — user is not creator/RSVP/invited
    setupSelectMock(null);

    const res = await GET(makeRequest(), makeParams('5'));

    expect(res.status).toBe(404);
    expect(mockVisibleForUser).toHaveBeenCalledWith('h-stranger');
  });

  it('returns 200 for a public event (unauthenticated caller)', async () => {
    mockAuth.mockResolvedValue(null);
    const publicEvent = { id: 10, visibility: 'public', title: 'Open Gathering' };
    setupSelectMock(publicEvent);

    const res = await GET(makeRequest(), makeParams('10'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 10, visibility: 'public' });
    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
  });

  it('returns 200 when caller is the event creator', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-creator', clerkId: null } });
    const privateEvent = { id: 20, visibility: 'private', title: 'My Private Event', creatorId: 'h-creator' };
    setupSelectMock(privateEvent);

    const res = await GET(makeRequest(), makeParams('20'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 20 });
    expect(mockVisibleForUser).toHaveBeenCalledWith('h-creator');
  });

  it('returns 200 when caller has an invitation row', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-invited', clerkId: null } });
    const privateEvent = { id: 30, visibility: 'private', title: 'Invite-Only Event' };
    // DB returns the event because visibility predicate includes invitation join
    setupSelectMock(privateEvent);

    const res = await GET(makeRequest(), makeParams('30'));

    expect(res.status).toBe(200);
    expect(mockVisibleForUser).toHaveBeenCalledWith('h-invited');
  });

  it('returns 200 when caller has an RSVP', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-rsvp', clerkId: null } });
    const privateEvent = { id: 40, visibility: 'private', title: 'RSVP Event' };
    // DB returns event because RSVP subquery matched in the visibility predicate
    setupSelectMock(privateEvent);

    const res = await GET(makeRequest(), makeParams('40'));

    expect(res.status).toBe(200);
    expect(mockVisibleForUser).toHaveBeenCalledWith('h-rsvp');
  });

  it('uses publicOnlyEventsCondition when no session', async () => {
    mockAuth.mockResolvedValue(null);
    setupSelectMock(null);

    await GET(makeRequest(), makeParams('99'));

    expect(mockPublicOnly).toHaveBeenCalledTimes(1);
    expect(mockVisibleForUser).not.toHaveBeenCalled();
  });

  it('falls back to clerkId when hyloId is absent', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: null, clerkId: 'clerk_55' } });
    setupSelectMock({ id: 50, visibility: 'private' });

    await GET(makeRequest(), makeParams('50'));

    expect(mockVisibleForUser).toHaveBeenCalledWith('clerk_55');
  });

  it('returns 400 for non-numeric id', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET(makeRequest(), makeParams('abc'));

    expect(res.status).toBe(400);
  });
});
