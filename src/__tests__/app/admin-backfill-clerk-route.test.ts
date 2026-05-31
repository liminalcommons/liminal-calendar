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
jest.mock('@/lib/auth/find-member-by-clerk-id', () => ({
  findMemberByClerkId: jest.fn(),
}));
jest.mock('@/lib/auth/sync-clerk-member-with-merge', () => ({
  syncClerkMemberWithMerge: jest.fn(),
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { clerkClient } from '@clerk/nextjs/server';
import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';
import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';
import { POST } from '@/app/api/admin/backfill-clerk/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;
const mockClerkClient = clerkClient as unknown as jest.Mock;
const mockFindByClerkId = findMemberByClerkId as unknown as jest.Mock;
const mockSync = syncClerkMemberWithMerge as unknown as jest.Mock;

// Canonical authed-user shapes the route reads (only the role gate matters here).
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

function makeUser(overrides: Partial<{
  id: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string; verification: { status?: string } | null }>;
}> = {}) {
  return {
    id: 'clerk_default',
    firstName: 'A',
    lastName: 'B',
    imageUrl: 'https://img/x.png',
    primaryEmailAddressId: 'e_1',
    emailAddresses: [
      { id: 'e_1', emailAddress: 'a@example.com', verification: { status: 'verified' } },
    ],
    ...overrides,
  };
}

function setupClerkUserList(users: ReturnType<typeof makeUser>[]) {
  const getUserList = jest.fn().mockResolvedValue({ data: users, totalCount: users.length });
  mockClerkClient.mockResolvedValue({ users: { getUserList } });
  return getUserList;
}

describe('POST /api/admin/backfill-clerk', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no session', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    mockGetAuthedUser.mockResolvedValue(memberUser);
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it('returns zero counts when Clerk has no users', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupClerkUserList([]);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      scanned: 0,
      alreadyProvisioned: 0,
      freshlyProvisioned: 0,
      failed: 0,
    });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('counts already-provisioned users without calling sync', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupClerkUserList([
      makeUser({ id: 'clerk_1' }),
      makeUser({ id: 'clerk_2' }),
    ]);
    mockFindByClerkId.mockResolvedValue({ id: 99, clerkId: 'clerk_1' });
    const res = await POST();
    const body = await res.json();
    expect(body.scanned).toBe(2);
    expect(body.alreadyProvisioned).toBe(2);
    expect(body.freshlyProvisioned).toBe(0);
    expect(body.failed).toBe(0);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('provisions fresh Clerk users and counts them', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupClerkUserList([
      makeUser({
        id: 'clerk_new',
        firstName: 'Florin',
        lastName: 'Test',
        primaryEmailAddressId: 'e_1',
        emailAddresses: [
          { id: 'e_1', emailAddress: 'florin@example.com', verification: { status: 'verified' } },
        ],
      }),
    ]);
    mockFindByClerkId.mockResolvedValue(undefined); // no row yet
    mockSync.mockResolvedValue(undefined);

    const res = await POST();
    const body = await res.json();
    expect(body.scanned).toBe(1);
    expect(body.alreadyProvisioned).toBe(0);
    expect(body.freshlyProvisioned).toBe(1);
    expect(body.failed).toBe(0);

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clerkId: 'clerk_new',
        name: 'Florin Test',
        email: 'florin@example.com',
        emailVerified: true,
      }),
    );
  });

  it('counts failures when sync throws and continues processing remaining users', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupClerkUserList([
      makeUser({ id: 'clerk_will_fail' }),
      makeUser({ id: 'clerk_ok' }),
    ]);
    mockFindByClerkId.mockResolvedValue(undefined);
    mockSync
      .mockRejectedValueOnce(new Error('DB constraint'))
      .mockResolvedValueOnce(undefined);

    const res = await POST();
    const body = await res.json();
    expect(body.scanned).toBe(2);
    expect(body.alreadyProvisioned).toBe(0);
    expect(body.freshlyProvisioned).toBe(1);
    expect(body.failed).toBe(1);

    expect(mockSync).toHaveBeenCalledTimes(2);
  });

  it('mixes already-provisioned and fresh in a single pass', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupClerkUserList([
      makeUser({ id: 'clerk_existing' }),
      makeUser({ id: 'clerk_fresh' }),
    ]);
    mockFindByClerkId.mockImplementation(async (_db: unknown, id: string) =>
      id === 'clerk_existing' ? { id: 1, clerkId: 'clerk_existing' } : undefined,
    );
    mockSync.mockResolvedValue(undefined);

    const res = await POST();
    const body = await res.json();
    expect(body.scanned).toBe(2);
    expect(body.alreadyProvisioned).toBe(1);
    expect(body.freshlyProvisioned).toBe(1);
    expect(body.failed).toBe(0);
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ clerkId: 'clerk_fresh' }),
    );
  });
});
