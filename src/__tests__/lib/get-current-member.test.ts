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
jest.mock('@/lib/auth/sync-logto-member-on-read', () => ({
  syncLogtoMemberOnRead: jest.fn(),
}));

import { auth as nextAuth } from '../../../auth';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { syncClerkMemberOnRead } from '@/lib/auth/sync-clerk-member-on-read';
import { syncLogtoMemberOnRead } from '@/lib/auth/sync-logto-member-on-read';
import { getCurrentMember } from '@/lib/auth/get-current-member';

const mockNextAuth = nextAuth as unknown as jest.Mock;
const mockClerkAuth = clerkAuth as unknown as jest.Mock;
const mockSyncOnRead = syncClerkMemberOnRead as unknown as jest.Mock;
const mockLogtoSync = syncLogtoMemberOnRead as unknown as jest.Mock;

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

  it('provisions a Logto member on read when no row exists yet, then returns it', async () => {
    // Regression: previously this returned null, 401-ing every protected
    // route for any Castalia user without a pre-existing email-matched row.
    const member = {
      id: 7,
      logtoId: 'logto-fresh',
      clerkId: null,
      name: 'Fresh',
      email: 'fresh@example.com',
    };
    mockNextAuth.mockResolvedValue({
      user: { logtoUserId: 'logto-fresh', email: 'fresh@example.com', name: 'Fresh' },
    });
    mockClerkAuth.mockResolvedValue({ userId: null });

    const { db, setRows } = makeMutableFakeDb();
    // Sync mock simulates the row appearing after provisioning.
    mockLogtoSync.mockImplementation(async () => {
      setRows([member]);
    });

    const result = await getCurrentMember(db);

    expect(mockLogtoSync).toHaveBeenCalledTimes(1);
    expect(mockLogtoSync).toHaveBeenCalledWith(db, {
      logtoUserId: 'logto-fresh',
      email: 'fresh@example.com',
      name: 'Fresh',
    });
    expect(result).toBe(member);
    // Provisioning succeeded → Clerk fallback never consulted.
    expect(mockClerkAuth).not.toHaveBeenCalled();
  });

  it('falls through to Clerk when Logto provisioning still yields no row', async () => {
    mockNextAuth.mockResolvedValue({ user: { logtoUserId: 'logto-unfixable' } });
    mockClerkAuth.mockResolvedValue({ userId: null });

    const { db } = makeMutableFakeDb(); // rows stay []
    mockLogtoSync.mockResolvedValue(undefined);

    const result = await getCurrentMember(db);

    expect(mockLogtoSync).toHaveBeenCalledTimes(1);
    expect(mockClerkAuth).toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
