/**
 * @jest-environment node
 *
 * Tests for GET /api/members/search?q=<query>&limit=<n>
 */

jest.mock('../../../auth', () => ({
  auth: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

import { auth } from '../../../auth';
import { GET } from '@/app/api/members/search/route';

const mockAuth = auth as unknown as jest.Mock;

function makeReq(search: string): import('next/server').NextRequest {
  return { url: `http://localhost/api/members/search${search}` } as unknown as import('next/server').NextRequest;
}

// Helper to set up the db chain for .select().from().where().limit()
function setupDbMock(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  dbModule.db.select = jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(() => Promise.resolve(rows)),
      })),
    })),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/members/search', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq('?q=alice'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when q is 1 character (too short)', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', clerkId: null } });
    const res = await GET(makeReq('?q=a'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when q is 51 characters (too long)', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', clerkId: null } });
    const longQ = 'a'.repeat(51);
    const res = await GET(makeReq(`?q=${longQ}`));
    expect(res.status).toBe(400);
  });

  it('returns shaped member results for a valid query', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', clerkId: null } });
    setupDbMock([
      { hyloId: 'h-2', clerkId: null, name: 'Alice', handle: 'alice', image: null },
      { hyloId: null, clerkId: 'c-3', name: 'Bob', handle: 'bob', image: 'img.png' },
    ]);

    const res = await GET(makeReq('?q=ali'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(2);
    expect(body.members[0]).toEqual({ userId: 'h-2', name: 'Alice', handle: 'alice', image: null });
    expect(body.members[1]).toEqual({ userId: 'c-3', name: 'Bob', handle: 'bob', image: 'img.png' });
    // Must NOT include email or role
    expect(body.members[0].email).toBeUndefined();
    expect(body.members[0].role).toBeUndefined();
  });

  it('excludes the requesting user from results', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', clerkId: null } });

    // Only rows NOT matching the requester should be returned
    setupDbMock([
      { hyloId: 'h-2', clerkId: null, name: 'Other User', handle: 'other', image: null },
    ]);

    const res = await GET(makeReq('?q=user'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Requesting user h-1 should not appear
    expect(body.members.every((m: { userId: string }) => m.userId !== 'h-1')).toBe(true);
  });

  it('applies default limit of 10 when not provided', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', clerkId: null } });

    const limitSpy = jest.fn(() => Promise.resolve([]));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
    dbModule.db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: limitSpy,
        })),
      })),
    }));

    await GET(makeReq('?q=alice'));
    expect(limitSpy).toHaveBeenCalledWith(10);
  });

  it('honors limit=25', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', clerkId: null } });

    const limitSpy = jest.fn(() => Promise.resolve([]));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
    dbModule.db.select = jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: limitSpy,
        })),
      })),
    }));

    const res = await GET(makeReq('?q=alice&limit=25'));
    expect(res.status).toBe(200);
    expect(limitSpy).toHaveBeenCalledWith(25);
  });

  it('returns 400 when limit=26 (exceeds max)', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', clerkId: null } });
    const res = await GET(makeReq('?q=alice&limit=26'));
    expect(res.status).toBe(400);
  });
});
