/**
 * @jest-environment node
 */
// Need Node env (not jsdom) for global Response/NextResponse used by the route.

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import { GET, PATCH } from '@/app/api/profile/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;

// Mock the db.update().set().where().returning() chain used by PATCH.
type UpdateChainResult = unknown[] | { error: Error };
function setupDbUpdateMock(result: UpdateChainResult) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  dbModule.db.update = () => ({
    set: () => ({
      where: () => ({
        returning: () => {
          if (Array.isArray(result)) return Promise.resolve(result);
          return Promise.reject(result.error);
        },
      }),
    }),
  });
}

describe('GET /api/profile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no Member is resolved', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with the profile when Member exists', async () => {
    const member = {
      id: 1,
      hyloId: 'h-1',
      clerkId: null,
      name: 'Alice',
      email: 'a@x.y',
      image: 'img.png',
      timezone: 'America/Los_Angeles',
      availability: '[1,2,3]',
    };
    mockGetCurrentMember.mockResolvedValue(member);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      hyloId: 'h-1',
      name: 'Alice',
      email: 'a@x.y',
      image: 'img.png',
      timezone: 'America/Los_Angeles',
      availability: [1, 2, 3],
    });
  });

  it('returns 200 with default timezone and empty availability when those fields are null', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1,
      hyloId: null,
      clerkId: 'clerk_x',
      name: 'B',
      email: null,
      image: null,
      timezone: null,
      availability: null,
    });
    const res = await GET();
    const body = await res.json();
    expect(body.timezone).toBe('UTC');
    expect(body.availability).toEqual([]);
  });
});

describe('PATCH /api/profile', () => {
  beforeEach(() => jest.clearAllMocks());

  // Build a minimal NextRequest stub. The route calls `request.json()`
  // and that's it — we don't need a real Request.
  function makeReq(body: unknown): import('next/server').NextRequest {
    return {
      json: () => {
        if (body === '__INVALID__') return Promise.reject(new Error('bad json'));
        return Promise.resolve(body);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it('returns 401 when no Member is resolved', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await PATCH(makeReq({ name: 'X' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when JSON parsing fails', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, hyloId: 'h', name: 'A' });
    const res = await PATCH(makeReq('__INVALID__'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON');
  });

  it('returns 400 when validation fails', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, hyloId: 'h', name: 'A' });
    // availability must be an array — string fails validation.
    const res = await PATCH(makeReq({ availability: 'not-an-array' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('availability must be an array');
  });

  it('returns 200 with updated profile on valid name update', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 7, hyloId: 'h-7', name: 'old' });
    setupDbUpdateMock([
      { hyloId: 'h-7', name: 'new', timezone: 'UTC', availability: '[]' },
    ]);
    const res = await PATCH(makeReq({ name: 'new' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('new');
  });
});
