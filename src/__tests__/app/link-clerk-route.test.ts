/**
 * @jest-environment node
 */

jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/auth/find-member-by-clerk-id', () => ({
  findMemberByClerkId: jest.fn(),
}));

import { auth as hyloAuth } from '../../../auth';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';
import { POST } from '@/app/api/account/link-clerk/route';

const mockHyloAuth = hyloAuth as unknown as jest.Mock;
const mockClerkAuth = clerkAuth as unknown as jest.Mock;
const mockFindByClerkId = findMemberByClerkId as unknown as jest.Mock;

// Mock chains for db: select (find Hylo Member) + update (attach link).
function setupDbMocks(opts: {
  hyloMember?: Record<string, unknown> | null;
  updateCapture?: { set?: unknown; where?: unknown };
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  const hyloRow = opts.hyloMember ? [opts.hyloMember] : [];

  dbModule.db.select = () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(hyloRow),
      }),
    }),
  });

  dbModule.db.update = () => ({
    set: (s: unknown) => {
      if (opts.updateCapture) opts.updateCapture.set = s;
      return {
        where: (w: unknown) => {
          if (opts.updateCapture) opts.updateCapture.where = w;
          return Promise.resolve();
        },
      };
    },
  });
}

describe('POST /api/account/link-clerk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when neither session is active', async () => {
    mockHyloAuth.mockResolvedValue(null);
    mockClerkAuth.mockResolvedValue({ userId: null });
    setupDbMocks({});
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 401 when only Hylo session is active', async () => {
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-1' } });
    mockClerkAuth.mockResolvedValue({ userId: null });
    setupDbMocks({});
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 401 when only Clerk session is active', async () => {
    mockHyloAuth.mockResolvedValue(null);
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_x' });
    setupDbMocks({});
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 200 already_linked when both sessions point to the same Member', async () => {
    const member = { id: 5, hyloId: 'h-1', clerkId: 'clerk_x', name: 'A' };
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-1' } });
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_x' });
    mockFindByClerkId.mockResolvedValue(member);
    setupDbMocks({ hyloMember: member });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('already_linked');
    expect(body.memberId).toBe(5);
  });

  it('returns 200 clerk_attached when only Hylo Member exists (attaches clerkId)', async () => {
    const hyloMember = { id: 7, hyloId: 'h-1', clerkId: null, name: 'A' };
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-1' } });
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_new' });
    mockFindByClerkId.mockResolvedValue(undefined);
    const updateCapture: { set?: unknown; where?: unknown } = {};
    setupDbMocks({ hyloMember, updateCapture });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('clerk_attached');
    expect(body.memberId).toBe(7);

    const set = updateCapture.set as Record<string, unknown>;
    expect(set.clerkId).toBe('clerk_new');
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it('returns 200 hylo_attached when only Clerk Member exists (attaches hyloId)', async () => {
    const clerkMember = { id: 8, hyloId: null, clerkId: 'clerk_x', name: 'B' };
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-new' } });
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_x' });
    mockFindByClerkId.mockResolvedValue(clerkMember);
    const updateCapture: { set?: unknown; where?: unknown } = {};
    setupDbMocks({ hyloMember: null, updateCapture });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('hylo_attached');
    expect(body.memberId).toBe(8);

    const set = updateCapture.set as Record<string, unknown>;
    expect(set.hyloId).toBe('h-new');
  });

  it('returns 409 when both providers map to distinct Members (merge required)', async () => {
    const hyloMember = { id: 10, hyloId: 'h-1', clerkId: null, name: 'A' };
    const clerkMember = { id: 11, hyloId: null, clerkId: 'clerk_x', name: 'B' };
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-1' } });
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_x' });
    mockFindByClerkId.mockResolvedValue(clerkMember);
    setupDbMocks({ hyloMember });

    const res = await POST();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.hyloMemberId).toBe(10);
    expect(body.clerkMemberId).toBe(11);
  });

  it('returns 500 when both sessions active but no Member rows exist (defensive)', async () => {
    mockHyloAuth.mockResolvedValue({ user: { hyloId: 'h-orphan' } });
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_orphan' });
    mockFindByClerkId.mockResolvedValue(undefined);
    setupDbMocks({ hyloMember: null });
    const res = await POST();
    expect(res.status).toBe(500);
  });
});
