/**
 * getCurrentMember — identity resolution.
 *
 * Castalia (Logto via NextAuth) is the sole identity provider: a session with
 * logtoUserId resolves (or provisions on read) the member row; otherwise null.
 */
jest.mock('../../../auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/auth/sync-logto-member-on-read', () => ({
  syncLogtoMemberOnRead: jest.fn(),
}));

import { auth as nextAuth } from '../../../auth';
import { syncLogtoMemberOnRead } from '@/lib/auth/sync-logto-member-on-read';
import { getCurrentMember } from '@/lib/auth/get-current-member';

const mockNextAuth = nextAuth as unknown as jest.Mock;
const mockLogtoSync = syncLogtoMemberOnRead as unknown as jest.Mock;

// Fake db whose row-set can be mutated mid-test, so we can simulate a row
// appearing after syncLogtoMemberOnRead provisions it.
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
  return { db, setRows: (r: unknown[]) => { rows = r; } };
}

describe('getCurrentMember', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the member matching a Logto session', async () => {
    const member = { id: 1, logtoId: 'logto-1', clerkId: null, name: 'Alice' };
    mockNextAuth.mockResolvedValue({ user: { logtoUserId: 'logto-1' } });
    const { db, setRows } = makeMutableFakeDb();
    setRows([member]);

    const result = await getCurrentMember(db);
    expect(result).toBe(member);
    // Row already present → no provisioning needed.
    expect(mockLogtoSync).not.toHaveBeenCalled();
  });

  it('provisions on read when no row exists yet, then returns it', async () => {
    const member = {
      id: 7, logtoId: 'logto-fresh', clerkId: null, name: 'Fresh', email: 'fresh@example.com',
    };
    mockNextAuth.mockResolvedValue({
      user: { logtoUserId: 'logto-fresh', email: 'fresh@example.com', name: 'Fresh' },
    });
    const { db, setRows } = makeMutableFakeDb();
    mockLogtoSync.mockImplementation(async () => { setRows([member]); });

    const result = await getCurrentMember(db);
    expect(mockLogtoSync).toHaveBeenCalledTimes(1);
    expect(mockLogtoSync).toHaveBeenCalledWith(db, {
      logtoUserId: 'logto-fresh',
      email: 'fresh@example.com',
      name: 'Fresh',
    });
    expect(result).toBe(member);
  });

  it('returns null when provisioning still yields no row', async () => {
    mockNextAuth.mockResolvedValue({ user: { logtoUserId: 'logto-unfixable' } });
    const { db } = makeMutableFakeDb(); // rows stay []
    mockLogtoSync.mockResolvedValue(undefined);

    const result = await getCurrentMember(db);
    expect(mockLogtoSync).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('returns null when no Logto session is active', async () => {
    mockNextAuth.mockResolvedValue(null);
    const { db } = makeMutableFakeDb();

    const result = await getCurrentMember(db);
    expect(result).toBeNull();
    expect(mockLogtoSync).not.toHaveBeenCalled();
  });

  it('returns null when the session has no logtoUserId', async () => {
    mockNextAuth.mockResolvedValue({ user: { email: 'a@b.c' } });
    const { db } = makeMutableFakeDb();

    const result = await getCurrentMember(db);
    expect(result).toBeNull();
    expect(mockLogtoSync).not.toHaveBeenCalled();
  });
});
