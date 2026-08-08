/**
 * The session claim is minted once and never refreshes, so promoting someone
 * via /admin (which writes members.role) used to leave their token saying
 * "member". /api/profile reads the table, so the admin page rendered for them
 * while every admin API returned 403. The stored role is authoritative.
 */

const mockNextAuth = jest.fn();
jest.mock('../../../auth', () => ({ auth: () => mockNextAuth() }));
jest.mock('@/lib/auth/get-current-member', () => ({ getCurrentMember: jest.fn() }));
jest.mock('@/lib/auth/sync-logto-member-on-read', () => ({ syncLogtoMemberOnRead: jest.fn() }));

let memberRow: { id: number; role: string } | null = null;
let selectThrows = false;

jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            if (selectThrows) return Promise.reject(new Error('db down'));
            return Promise.resolve(memberRow ? [memberRow] : []);
          },
        }),
      }),
    }),
  },
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { syncLogtoMemberOnRead } from '@/lib/auth/sync-logto-member-on-read';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;
const mockSync = syncLogtoMemberOnRead as unknown as jest.Mock;

/** A Logto session whose role claim may be stale. */
function logtoSession(claimRole: string | undefined) {
  return { user: { logtoUserId: 'logto-1', role: claimRole, name: 'Ada', email: 'a@x.com' } };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  memberRow = null;
  selectThrows = false;
  mockNextAuth.mockResolvedValue(null);
  mockGetCurrentMember.mockResolvedValue(null);
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('getAuthedUser — Logto role resolution', () => {
  it('uses the stored role when the session claim is stale', async () => {
    mockNextAuth.mockResolvedValue(logtoSession('member')); // stale claim
    memberRow = { id: 7, role: 'admin' }; // promoted since the token was issued

    const user = await getAuthedUser();

    expect(user?.role).toBe('admin');
    expect(user?.memberId).toBe(7);
  });

  it('demotes too — a stale admin claim does not outrank the table', async () => {
    mockNextAuth.mockResolvedValue(logtoSession('admin'));
    memberRow = { id: 7, role: 'member' };

    expect((await getAuthedUser())?.role).toBe('member');
  });

  it('normalizes an unrecognized stored role to member', async () => {
    mockNextAuth.mockResolvedValue(logtoSession('admin'));
    memberRow = { id: 7, role: 'wizard' };

    expect((await getAuthedUser())?.role).toBe('member');
  });

  it('falls back to the session claim when the row cannot be read', async () => {
    // Preserves the pre-existing degrade-gracefully behaviour rather than
    // locking a real admin out during a transient database problem.
    mockNextAuth.mockResolvedValue(logtoSession('admin'));
    selectThrows = true;

    const user = await getAuthedUser();

    expect(user?.role).toBe('admin');
    expect(user?.memberId).toBeNull();
  });

  it('provisions on read when no row exists yet, then uses the stored role', async () => {
    mockNextAuth.mockResolvedValue(logtoSession('member'));
    mockSync.mockImplementation(() => {
      memberRow = { id: 12, role: 'host' }; // row appears after provisioning
      return Promise.resolve();
    });

    const user = await getAuthedUser();

    expect(mockSync).toHaveBeenCalled();
    expect(user?.memberId).toBe(12);
    expect(user?.role).toBe('host');
  });
});

describe('getAuthedUser — Clerk path', () => {
  it('reads the role from the member row', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 3,
      clerkId: 'clerk-1',
      role: 'admin',
      name: 'Bo',
      image: null,
      email: 'b@x.com',
    });

    const user = await getAuthedUser();

    expect(user?.role).toBe('admin');
    expect(user?.memberId).toBe(3);
  });

  it('returns null when no identity resolves', async () => {
    expect(await getAuthedUser()).toBeNull();
  });
});
