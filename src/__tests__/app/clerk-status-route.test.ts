/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@clerk/nextjs/server', () => ({
  clerkClient: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { clerkClient } from '@clerk/nextjs/server';
import { GET } from '@/app/api/admin/clerk-status/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;
const mockClerkClient = clerkClient as unknown as jest.Mock;

// Canonical authed-user shapes the route reads (only the role gate matters).
const adminUser = {
  memberId: 1,
  id: 'logto-admin',
  role: 'admin' as const,
  name: 'Admin',
  image: null,
  logtoUserId: 'logto-admin',
};
const memberUser = {
  memberId: 2,
  id: 'logto-member',
  role: 'member' as const,
  name: 'Member',
  image: null,
  logtoUserId: 'logto-member',
};

function setupDbCount(membersWithClerkId: number) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  dbModule.db.select = () => ({
    from: () => ({
      where: () => Promise.resolve([{ count: membersWithClerkId }]),
    }),
  });
}

describe('GET /api/admin/clerk-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when no session is active', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    setupDbCount(0);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    mockGetAuthedUser.mockResolvedValue(memberUser);
    setupDbCount(0);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 200 with provider gap counts for admin', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    mockClerkClient.mockResolvedValue({
      users: { getCount: jest.fn().mockResolvedValue(5) },
    });
    setupDbCount(2);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clerkUsersInClerk).toBe(5);
    expect(body.membersWithClerkId).toBe(2);
    expect(body.gap).toBe(3);
  });

  it('returns 200 with gap=0 when all Clerk users are provisioned', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    mockClerkClient.mockResolvedValue({
      users: { getCount: jest.fn().mockResolvedValue(7) },
    });
    setupDbCount(7);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gap).toBe(0);
  });
});
