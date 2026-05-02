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
jest.mock('@/lib/auth/find-member-by-clerk-id', () => ({
  findMemberByClerkId: jest.fn(),
}));
jest.mock('@/lib/auth/sync-clerk-member-with-merge', () => ({
  syncClerkMemberWithMerge: jest.fn(),
}));

import { auth } from '../../../auth';
import { clerkClient } from '@clerk/nextjs/server';
import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';
import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';
import { POST } from '@/app/api/admin/backfill-clerk/route';

const mockAuth = auth as unknown as jest.Mock;
const mockClerkClient = clerkClient as unknown as jest.Mock;
const mockFindByClerkId = findMemberByClerkId as unknown as jest.Mock;
const mockSync = syncClerkMemberWithMerge as unknown as jest.Mock;

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
    mockAuth.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', role: 'member' } });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it('returns zero counts when Clerk has no users', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
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
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
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
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
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
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
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
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
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
