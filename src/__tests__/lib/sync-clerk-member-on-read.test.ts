/**
 * @jest-environment node
 */

jest.mock('@clerk/nextjs/server', () => ({
  clerkClient: jest.fn(),
}));
jest.mock('@/lib/auth/sync-clerk-member-with-merge', () => ({
  syncClerkMemberWithMerge: jest.fn(),
}));

import { clerkClient } from '@clerk/nextjs/server';
import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';
import { syncClerkMemberOnRead } from '@/lib/auth/sync-clerk-member-on-read';

const mockClerkClient = clerkClient as unknown as jest.Mock;
const mockSync = syncClerkMemberWithMerge as unknown as jest.Mock;

function setupClerkUser(user: unknown) {
  const getUser = jest.fn().mockResolvedValue(user);
  mockClerkClient.mockResolvedValue({ users: { getUser } });
  return getUser;
}

function setupClerkUserError(err: Error) {
  const getUser = jest.fn().mockRejectedValue(err);
  mockClerkClient.mockResolvedValue({ users: { getUser } });
  return getUser;
}

const fakeDb = { __mock: true } as unknown as Parameters<
  typeof syncClerkMemberOnRead
>[0];

describe('syncClerkMemberOnRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps verified primary email + names → calls syncClerkMemberWithMerge', async () => {
    const getUser = setupClerkUser({
      id: 'clerk_xxx',
      firstName: 'Florin',
      lastName: 'Test',
      imageUrl: 'https://img.clerk.dev/x.png',
      primaryEmailAddressId: 'email_1',
      emailAddresses: [
        {
          id: 'email_1',
          emailAddress: 'florin@example.com',
          verification: { status: 'verified' },
        },
      ],
    });

    await syncClerkMemberOnRead(fakeDb, 'clerk_xxx');

    expect(getUser).toHaveBeenCalledWith('clerk_xxx');
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith(fakeDb, {
      clerkId: 'clerk_xxx',
      name: 'Florin Test',
      email: 'florin@example.com',
      image: 'https://img.clerk.dev/x.png',
      emailVerified: true,
    });
  });

  it('propagates emailVerified=false when primary email is unverified', async () => {
    setupClerkUser({
      id: 'clerk_unverified',
      firstName: 'A',
      lastName: null,
      imageUrl: '',
      primaryEmailAddressId: 'email_p',
      emailAddresses: [
        {
          id: 'email_p',
          emailAddress: 'pending@example.com',
          verification: { status: 'unverified' },
        },
      ],
    });

    await syncClerkMemberOnRead(fakeDb, 'clerk_unverified');

    expect(mockSync).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        emailVerified: false,
        email: 'pending@example.com',
        name: 'A',
      }),
    );
  });

  it('picks the primary email when multiple are present', async () => {
    setupClerkUser({
      id: 'clerk_multi',
      firstName: null,
      lastName: null,
      imageUrl: '',
      primaryEmailAddressId: 'email_2',
      emailAddresses: [
        {
          id: 'email_1',
          emailAddress: 'first@example.com',
          verification: { status: 'verified' },
        },
        {
          id: 'email_2',
          emailAddress: 'primary@example.com',
          verification: { status: 'verified' },
        },
      ],
    });

    await syncClerkMemberOnRead(fakeDb, 'clerk_multi');

    expect(mockSync).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        email: 'primary@example.com',
        name: null,
      }),
    );
  });

  it('falls back to first email when primaryEmailAddressId is null', async () => {
    setupClerkUser({
      id: 'clerk_noprimary',
      firstName: 'Z',
      lastName: 'Y',
      imageUrl: '',
      primaryEmailAddressId: null,
      emailAddresses: [
        {
          id: 'email_a',
          emailAddress: 'only@example.com',
          verification: { status: 'verified' },
        },
      ],
    });

    await syncClerkMemberOnRead(fakeDb, 'clerk_noprimary');

    expect(mockSync).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ email: 'only@example.com' }),
    );
  });

  it('does NOT throw when Clerk getUser fails — read paths must not crash', async () => {
    setupClerkUserError(new Error('Clerk 404'));

    await expect(
      syncClerkMemberOnRead(fakeDb, 'clerk_gone'),
    ).resolves.toBeUndefined();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('does NOT throw when syncClerkMemberWithMerge fails — read paths must not crash', async () => {
    setupClerkUser({
      id: 'clerk_db_err',
      firstName: 'X',
      lastName: null,
      imageUrl: '',
      primaryEmailAddressId: 'e_1',
      emailAddresses: [
        {
          id: 'e_1',
          emailAddress: 'x@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockSync.mockRejectedValue(new Error('DB write failed'));

    // Even when the inner sync rejects (e.g., DB outage, schema violation),
    // the helper must resolve undefined so that callers like
    // getCurrentMember return null instead of crashing the request.
    await expect(
      syncClerkMemberOnRead(fakeDb, 'clerk_db_err'),
    ).resolves.toBeUndefined();
    expect(mockSync).toHaveBeenCalledTimes(1);
  });
});
