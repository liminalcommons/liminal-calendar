/**
 * @jest-environment node
 */

jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));
jest.mock('@clerk/nextjs/server', () => ({
  clerkClient: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

import { auth as hyloAuth } from '../../../auth';
import { clerkClient } from '@clerk/nextjs/server';
import { GET } from '@/app/api/admin/clerk-status/route';

const mockHyloAuth = hyloAuth as unknown as jest.Mock;
const mockClerkClient = clerkClient as unknown as jest.Mock;

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

  it('returns 401 when no Hylo session is active', async () => {
    mockHyloAuth.mockResolvedValue(null);
    setupDbCount(0);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-1', role: 'member' } });
    setupDbCount(0);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 200 with provider gap counts for admin', async () => {
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-1', role: 'admin' } });
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
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-1', role: 'admin' } });
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
