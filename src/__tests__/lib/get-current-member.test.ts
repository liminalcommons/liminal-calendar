// Mock all auth modules before importing.
jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}));
jest.mock('@/lib/auth/sync-clerk-member-on-read', () => ({
  syncClerkMemberOnRead: jest.fn(),
}));

import { auth as nextAuth } from '../../../auth';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { syncClerkMemberOnRead } from '@/lib/auth/sync-clerk-member-on-read';
import { getCurrentMember } from '@/lib/auth/get-current-member';

const mockNextAuth = nextAuth as unknown as jest.Mock;
const mockClerkAuth = clerkAuth as unknown as jest.Mock;
const mockSyncOnRead = syncClerkMemberOnRead as unknown as jest.Mock;

function makeFakeDb(rowToReturn: unknown[] = []) {
  const calls: { from?: unknown; where?: unknown; limit?: unknown } = {};
  return {
    db: {
      select: () => ({
        from: (table: unknown) => {
          calls.from = table;
          return {
            where: (predicate: unknown) => {
              calls.where = predicate;
              return {
                limit: (n: unknown) => {
                  calls.limit = n;
                  return Promise.resolve(rowToReturn);
                },
              };
            },
          };
        },
      }),
    },
    calls,
  };
}

// Stateful fake db whose row-set can be mutated mid-test, simulating a
// row appearing in the members table after defensive sync runs.
function makeMutableFakeDb() {
  let rows: unknown[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
  return {
    db,
    setRows: (newRows: unknown[]) => {
      rows = newRows;
    },
  };
}

describe('getCurrentMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns Member matching Logto session.user.logtoUserId (Logto path takes precedence)', async () => {
    const member = { id: 1, logtoId: 'logto-1', clerkId: null, name: 'Alice' };
    mockNextAuth.mockResolvedValue({ user: { logtoUserId: 'logto-1' } });
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_should_be_ignored' });
    const { db } = makeFakeDb([member]);

    const result = await getCurrentMember(db);

    expect(result).toBe(member);
    // Logto path took precedence — Clerk session not consulted.
    expect(mockClerkAuth).not.toHaveBeenCalled();
    expect(mockSyncOnRead).not.toHaveBeenCalled();
  });

  it('falls through to Clerk session when no Logto session is active', async () => {
    const member = { id: 2, logtoId: null, clerkId: 'clerk_42', name: 'Bob' };
    mockNextAuth.mockResolvedValue(null);
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_42' });
    const { db } = makeFakeDb([member]);

    const result = await getCurrentMember(db);

    expect(result).toBe(member);
    expect(mockNextAuth).toHaveBeenCalled();
    expect(mockClerkAuth).toHaveBeenCalled();
    // Row already present → no need to defensively sync.
    expect(mockSyncOnRead).not.toHaveBeenCalled();
  });

  it('falls through to Clerk session when Logto session has no logtoUserId', async () => {
    const member = { id: 2, logtoId: null, clerkId: 'clerk_x', name: 'C' };
    mockNextAuth.mockResolvedValue({ user: {} });
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_x' });
    const { db } = makeFakeDb([member]);

    const result = await getCurrentMember(db);
    expect(result).toBe(member);
    expect(mockSyncOnRead).not.toHaveBeenCalled();
  });

  it('returns null when neither session is active', async () => {
    mockNextAuth.mockResolvedValue(null);
    mockClerkAuth.mockResolvedValue({ userId: null });
    const { db } = makeFakeDb([]);

    const result = await getCurrentMember(db);
    expect(result).toBeNull();
    expect(mockSyncOnRead).not.toHaveBeenCalled();
  });

  it('defensively syncs missing Clerk member, then returns the freshly-provisioned row', async () => {
    const member = {
      id: 99,
      logtoId: null,
      clerkId: 'clerk_new',
      name: 'Florin Test',
    };
    mockNextAuth.mockResolvedValue(null);
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_new' });

    const { db, setRows } = makeMutableFakeDb();
    // First findMemberByClerkId returns [] (row missing).
    // Sync mock simulates the row appearing in the table.
    mockSyncOnRead.mockImplementation(async () => {
      setRows([member]);
    });

    const result = await getCurrentMember(db);

    expect(mockSyncOnRead).toHaveBeenCalledWith(db, 'clerk_new');
    expect(mockSyncOnRead).toHaveBeenCalledTimes(1);
    expect(result).toBe(member);
  });

  it('returns null when defensive sync runs but provisioning still fails', async () => {
    mockNextAuth.mockResolvedValue(null);
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_unfixable' });

    const { db } = makeMutableFakeDb();
    // Sync runs but does not create a row (e.g., Clerk getUser failed —
    // syncClerkMemberOnRead swallows the error per its contract).
    mockSyncOnRead.mockResolvedValue(undefined);

    const result = await getCurrentMember(db);

    expect(mockSyncOnRead).toHaveBeenCalledWith(db, 'clerk_unfixable');
    expect(result).toBeNull();
  });

  it('returns null when Logto session has logtoUserId but no Member row exists', async () => {
    mockNextAuth.mockResolvedValue({ user: { logtoUserId: 'logto-orphan' } });
    mockClerkAuth.mockResolvedValue({ userId: null });
    const { db } = makeFakeDb([]);

    const result = await getCurrentMember(db);
    expect(result).toBeNull();
    // After Logto miss, falls through to Clerk; Clerk has no user, no sync.
    expect(mockSyncOnRead).not.toHaveBeenCalled();
  });
});
