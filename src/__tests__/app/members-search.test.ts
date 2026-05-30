/**
 * @jest-environment node
 *
 * Tests for GET /api/members/search?q=<query>&limit=<n>
 */

jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { select: jest.fn() },
}));

// Record which COLUMNS the search matches on, so we can assert email is never
// one of them (the enumeration-oracle the fix removes).
const ilikeCols: unknown[] = [];
jest.mock('drizzle-orm', () => ({
  ilike: jest.fn((col: unknown) => {
    ilikeCols.push(col);
    return { __op: 'ilike', col };
  }),
  or: jest.fn((...args: unknown[]) => ({ __op: 'or', args })),
  and: jest.fn((...args: unknown[]) => ({ __op: 'and', args })),
  not: jest.fn((arg: unknown) => ({ __op: 'not', arg })),
  eq: jest.fn((col: unknown, val: unknown) => ({ __op: 'eq', col, val })),
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { GET } from '@/app/api/members/search/route';

const mockAuth = getAuthedUser as unknown as jest.Mock;
const mockSelect = db.select as unknown as jest.Mock;

function makeReq(search: string): import('next/server').NextRequest {
  return { url: `http://localhost/api/members/search${search}` } as unknown as import('next/server').NextRequest;
}

function setupDbMock(rows: unknown[], limitSpy?: jest.Mock) {
  mockSelect.mockReturnValue({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: limitSpy ?? jest.fn(() => Promise.resolve(rows)),
      })),
    })),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  ilikeCols.length = 0;
});

describe('GET /api/members/search', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq('?q=alice'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when q is too short / too long', async () => {
    mockAuth.mockResolvedValue({ id: 'logto-1' });
    expect((await GET(makeReq('?q=a'))).status).toBe(400);
    expect((await GET(makeReq(`?q=${'a'.repeat(51)}`))).status).toBe(400);
  });

  it('returns shaped results (userId/name/handle/image only)', async () => {
    mockAuth.mockResolvedValue({ id: 'logto-1' });
    setupDbMock([
      { logtoId: 'h-2', clerkId: null, name: 'Alice', handle: 'alice', image: null },
      { logtoId: null, clerkId: 'c-3', name: 'Bob', handle: 'bob', image: 'img.png' },
    ]);
    const res = await GET(makeReq('?q=ali'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members[0]).toEqual({ userId: 'h-2', name: 'Alice', handle: 'alice', image: null });
    for (const m of body.members) {
      expect(m).not.toHaveProperty('email');
      expect(m).not.toHaveProperty('role');
    }
  });

  it('SECURITY: never matches on the email column (no enumeration oracle)', async () => {
    mockAuth.mockResolvedValue({ id: 'logto-1' });
    setupDbMock([]);
    await GET(makeReq('?q=someone@example.com'));
    expect(ilikeCols).toContain(members.name);
    expect(ilikeCols).toContain(members.handle);
    expect(ilikeCols).not.toContain(members.email);
  });

  it('applies default limit 10 and honors limit=25', async () => {
    mockAuth.mockResolvedValue({ id: 'logto-1' });
    const limitSpy = jest.fn(() => Promise.resolve([]));
    setupDbMock([], limitSpy);
    await GET(makeReq('?q=alice'));
    expect(limitSpy).toHaveBeenCalledWith(10);
    await GET(makeReq('?q=alice&limit=25'));
    expect(limitSpy).toHaveBeenCalledWith(25);
  });

  it('returns 400 when limit=26 (exceeds max)', async () => {
    mockAuth.mockResolvedValue({ id: 'logto-1' });
    expect((await GET(makeReq('?q=alice&limit=26'))).status).toBe(400);
  });
});
