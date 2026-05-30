/**
 * @jest-environment node
 */
import { GET } from '@/app/api/members/search/route';

// Mock auth + db
jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { select: jest.fn() },
}));

// Mock drizzle operators so we can record which COLUMNS the query matches on.
// `ilike` is the search operator — we assert it is never called against the
// email column (the enumeration-oracle the fix removes).
const ilikeCols: unknown[] = [];
jest.mock('drizzle-orm', () => ({
  ilike: jest.fn((col: unknown) => {
    ilikeCols.push(col);
    return { __op: 'ilike', col };
  }),
  or: jest.fn((...args: unknown[]) => ({ __op: 'or', args })),
  and: jest.fn((...args: unknown[]) => ({ __op: 'and', args })),
  ne: jest.fn((col: unknown, val: unknown) => ({ __op: 'ne', col, val })),
  sql: jest.fn(),
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';

const mockAuth = getAuthedUser as unknown as jest.Mock;
const mockSelect = db.select as unknown as jest.Mock;

function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  return chain;
}

function makeReq(q: string) {
  return {
    nextUrl: { searchParams: new URLSearchParams(q ? { q } : {}) },
  } as unknown as import('next/server').NextRequest;
}

describe('GET /api/members/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ilikeCols.length = 0;
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq('alice'));
    expect(res.status).toBe(401);
  });

  it('returns empty array for short queries', async () => {
    mockAuth.mockResolvedValue({ memberId: 1 });
    const res = await GET(makeReq('a'));
    const body = await res.json();
    expect(body.members).toEqual([]);
  });

  it('searches by name/handle and returns matches', async () => {
    mockAuth.mockResolvedValue({ memberId: 1 });
    mockSelect.mockReturnValue(buildSelectChain([{ id: 2, name: 'Alice', handle: 'alice', image: null }]));
    const res = await GET(makeReq('alice'));
    const body = await res.json();
    expect(body.members).toHaveLength(1);
  });

  it('NEVER matches on the email column (no enumeration oracle)', async () => {
    mockAuth.mockResolvedValue({ memberId: 1 });
    mockSelect.mockReturnValue(buildSelectChain([]));
    await GET(makeReq('someone@example.com'));
    // ilike must be applied to name and handle only — never email.
    expect(ilikeCols).toContain(members.name);
    expect(ilikeCols).toContain(members.handle);
    expect(ilikeCols).not.toContain(members.email);
  });

  it('never returns email or role fields in the response shape', async () => {
    mockAuth.mockResolvedValue({ memberId: 1 });
    mockSelect.mockReturnValue(
      buildSelectChain([{ id: 2, name: 'Alice', handle: 'alice', image: null }]),
    );
    const res = await GET(makeReq('alice'));
    const body = await res.json();
    for (const m of body.members) {
      expect(m).not.toHaveProperty('email');
      expect(m).not.toHaveProperty('role');
    }
  });
});
