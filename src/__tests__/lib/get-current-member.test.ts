// Mock both auth modules before importing.
jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}));

import { auth as hyloAuth } from '../../../auth';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { getCurrentMember } from '@/lib/auth/get-current-member';

const mockHyloAuth = hyloAuth as unknown as jest.Mock;
const mockClerkAuth = clerkAuth as unknown as jest.Mock;

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

describe('getCurrentMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns Member matching Hylo session.user.hyloId (Hylo path takes precedence)', async () => {
    const member = { id: 1, hyloId: 'h-1', clerkId: null, name: 'Alice' };
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-1' } });
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_should_be_ignored' });
    const { db } = makeFakeDb([member]);

    const result = await getCurrentMember(db);

    expect(result).toBe(member);
    // Hylo path took precedence — Clerk session not consulted.
    expect(mockClerkAuth).not.toHaveBeenCalled();
  });

  it('falls through to Clerk session when no Hylo session is active', async () => {
    const member = { id: 2, hyloId: null, clerkId: 'clerk_42', name: 'Bob' };
    mockHyloAuth.mockResolvedValue(null);
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_42' });
    const { db } = makeFakeDb([member]);

    const result = await getCurrentMember(db);

    expect(result).toBe(member);
    expect(mockHyloAuth).toHaveBeenCalled();
    expect(mockClerkAuth).toHaveBeenCalled();
  });

  it('falls through to Clerk session when Hylo session has no hyloId', async () => {
    const member = { id: 2, hyloId: null, clerkId: 'clerk_x', name: 'C' };
    // Hylo session present but missing hyloId (edge case)
    mockHyloAuth.mockResolvedValue({ user: {} });
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_x' });
    const { db } = makeFakeDb([member]);

    const result = await getCurrentMember(db);
    expect(result).toBe(member);
  });

  it('returns null when neither session is active', async () => {
    mockHyloAuth.mockResolvedValue(null);
    mockClerkAuth.mockResolvedValue({ userId: null });
    const { db } = makeFakeDb([]);

    const result = await getCurrentMember(db);
    expect(result).toBeNull();
  });

  it('returns null when Clerk session is active but no Member row exists yet', async () => {
    // First-time Clerk user before sync wiring — row not provisioned yet.
    mockHyloAuth.mockResolvedValue(null);
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_unprovisioned' });
    const { db } = makeFakeDb([]);

    const result = await getCurrentMember(db);
    expect(result).toBeNull();
  });

  it('returns null when Hylo session has hyloId but no Member row exists', async () => {
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-orphan' } });
    const { db } = makeFakeDb([]);

    const result = await getCurrentMember(db);
    expect(result).toBeNull();
    // Hylo path matched — Clerk session not consulted even though row missing.
    expect(mockClerkAuth).not.toHaveBeenCalled();
  });
});
