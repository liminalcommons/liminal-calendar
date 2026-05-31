/**
 * @jest-environment node
 *
 * Regression test for issue #8 — "event shows up after refreshing".
 * After POST /api/events succeeds we MUST call revalidatePath('/'), '/list',
 * '/month' so the Next.js Full Route Cache is invalidated and the freshly
 * created event appears on subsequent navigation without a manual reload.
 */

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));
jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@/lib/auth-helpers', () => ({
  getUserRole: jest.fn(() => 'admin'),
  canCreateEvents: jest.fn(() => true),
  canCreatePublicEvent: jest.fn(() => true),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/db/to-display-event', () => ({
  dbEventToDisplayEvent: (e: unknown) => ({ id: 'display-1', src: e }),
}));
jest.mock('@/lib/events/create-event-input', () => ({
  validateCreateEventInput: jest.fn(() => ({
    ok: true,
    value: {
      title: 'Test',
      description: 'd',
      startDate: new Date('2026-06-01T18:00:00Z'),
      endDate: new Date('2026-06-01T19:00:00Z'),
      timezone: 'UTC',
      location: null,
      imageUrl: null,
      recurrenceRule: null,
    },
  })),
}));

import { revalidatePath } from 'next/cache';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { POST } from '@/app/api/events/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;
const mockRevalidate = revalidatePath as unknown as jest.Mock;

function setupInsertMock(returnedRow: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  dbModule.db.insert = () => ({
    values: () => ({
      returning: () => Promise.resolve([returnedRow]),
    }),
  });
}

function makeReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest;
}

describe('POST /api/events — issue #8 cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthedUser.mockResolvedValue({
      memberId: 69147, id: '69147', name: 'Tester', image: null, role: 'admin',
    });
    setupInsertMock({
      id: 42,
      title: 'Test',
      startsAt: new Date('2026-06-01T18:00:00Z'),
    });
  });

  it('calls revalidatePath for /, /list, and /month after successful create', async () => {
    const res = await POST(
      makeReq({ title: 'Test', startDate: '2026-06-01T18:00:00Z' }),
    );

    expect(res.status).toBe(201);
    expect(mockRevalidate).toHaveBeenCalledWith('/');
    expect(mockRevalidate).toHaveBeenCalledWith('/list');
    expect(mockRevalidate).toHaveBeenCalledWith('/month');
    expect(mockRevalidate).toHaveBeenCalledTimes(3);
  });

  it('does NOT call revalidatePath when auth fails', async () => {
    mockGetAuthedUser.mockResolvedValue(null);

    const res = await POST(makeReq({ title: 'Test' }));

    expect(res.status).toBe(401);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
