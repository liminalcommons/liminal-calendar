/**
 * @jest-environment node
 *
 * Tests for PUT /api/profile/handle — Task 1 of Plan 3 (1:1 Booking).
 */

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
// PUT revalidates calendar views + handle paths on success; outside a Next.js
// request context revalidatePath throws "static generation store missing".
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));
jest.mock('@/lib/cache/revalidate-calendar-views', () => ({
  revalidateCalendarViews: jest.fn(),
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import { PUT } from '@/app/api/profile/handle/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;

function makeReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest;
}

// Mock db.select().from().where().limit() for the "is handle taken?" check
// and db.update().set().where().returning() for the actual update.
function setupDbMocks(opts: {
  takenBy?: { id: number } | null;
  updated?: Array<{ id: number; handle: string | null }>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  const selectChain = {
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(() => Promise.resolve(opts.takenBy ? [opts.takenBy] : [])),
      })),
    })),
  };
  const updateSet = jest.fn(() => ({
    where: jest.fn(() => ({
      returning: jest.fn(() => Promise.resolve(opts.updated ?? [])),
    })),
  }));
  dbModule.db.select = jest.fn(() => selectChain);
  dbModule.db.update = jest.fn(() => ({ set: updateSet }));
  return { updateSet };
}

describe('PUT /api/profile/handle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await PUT(makeReq({ handle: 'alice' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when handle is missing/empty', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const res = await PUT(makeReq({ handle: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when handle is too short (<3 chars)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const res = await PUT(makeReq({ handle: 'ab' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when handle is too long (>30 chars)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const res = await PUT(makeReq({ handle: 'a'.repeat(31) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when handle has invalid characters', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const res = await PUT(makeReq({ handle: 'alice!' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when handle starts with a hyphen', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const res = await PUT(makeReq({ handle: '-alice' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when handle is reserved (admin)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const res = await PUT(makeReq({ handle: 'admin' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when handle is reserved (api)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const res = await PUT(makeReq({ handle: 'api' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 when handle is taken by another member', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    setupDbMocks({ takenBy: { id: 2 } });
    const res = await PUT(makeReq({ handle: 'taken' }));
    expect(res.status).toBe(409);
  });

  it('returns 200 when handle is valid and unique', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const { updateSet } = setupDbMocks({
      takenBy: null,
      updated: [{ id: 1, handle: 'alice' }],
    });
    const res = await PUT(makeReq({ handle: 'alice' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handle).toBe('alice');
    // Verify the update was called with a lowercased handle.
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'alice' }),
    );
  });

  it('is idempotent: re-setting own handle returns 200 (not 409)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    // Same handle "taken" but by the same caller (id matches).
    setupDbMocks({
      takenBy: { id: 1 },
      updated: [{ id: 1, handle: 'alice' }],
    });
    const res = await PUT(makeReq({ handle: 'alice' }));
    expect(res.status).toBe(200);
  });

  it('lowercases input before validating + storing (MixedCase accepted)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const { updateSet } = setupDbMocks({
      takenBy: null,
      updated: [{ id: 1, handle: 'alice' }],
    });
    const res = await PUT(makeReq({ handle: 'ALICE' }));
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'alice' }),
    );
  });

  it('returns 400 on invalid JSON body', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const req = {
      json: () => Promise.reject(new Error('bad json')),
    } as unknown as import('next/server').NextRequest;
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing handle key', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1 });
    const res = await PUT(makeReq({}));
    expect(res.status).toBe(400);
  });
});
