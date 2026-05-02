/**
 * @jest-environment node
 */

jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

import { auth } from '../../../auth';
import { GET, PATCH } from '@/app/api/admin/members/route';

const mockAuth = auth as unknown as jest.Mock;

interface UpdateCapture {
  set?: Record<string, unknown>;
  whereCalled?: boolean;
}

function setupDbMocks(opts: {
  selectRows?: unknown[];
  updateReturn?: unknown[];
  updateCapture?: UpdateCapture;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };

  dbModule.db.select = () => ({
    from: () => Promise.resolve(opts.selectRows ?? []),
  });

  dbModule.db.update = () => ({
    set: (s: Record<string, unknown>) => {
      if (opts.updateCapture) opts.updateCapture.set = s;
      return {
        where: () => {
          if (opts.updateCapture) opts.updateCapture.whereCalled = true;
          return {
            returning: () => Promise.resolve(opts.updateReturn ?? []),
          };
        },
      };
    },
  });
}

function patchReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('GET /api/admin/members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all members for admin (Hylo + Clerk-only rows)', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
    const hyloMember = { id: 1, hyloId: 'h-1', clerkId: null, name: 'Hylo' };
    const clerkMember = { id: 2, hyloId: null, clerkId: 'clerk_x', name: 'Clerk' };
    setupDbMocks({ selectRows: [hyloMember, clerkMember] });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].clerkId).toBeNull();
    expect(body[1].hyloId).toBeNull();
    expect(body[1].clerkId).toBe('clerk_x');
  });

  it('returns 401 when no session', async () => {
    mockAuth.mockResolvedValue(null);
    setupDbMocks({});
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', role: 'member' } });
    setupDbMocks({});
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates role for a Hylo-keyed member (existing behavior)', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
    const updateCapture: UpdateCapture = {};
    const updated = { id: 7, hyloId: 'h-1', clerkId: null, role: 'host' };
    setupDbMocks({ updateReturn: [updated], updateCapture });

    const res = await PATCH(patchReq({ hyloId: 'h-1', role: 'host' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('host');
    expect(updateCapture.set?.role).toBe('host');
    expect(updateCapture.whereCalled).toBe(true);
  });

  it('updates role for a Clerk-only member (new behavior)', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
    const updateCapture: UpdateCapture = {};
    const updated = { id: 9, hyloId: null, clerkId: 'clerk_y', role: 'admin' };
    setupDbMocks({ updateReturn: [updated], updateCapture });

    const res = await PATCH(patchReq({ clerkId: 'clerk_y', role: 'admin' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('admin');
    expect(body.clerkId).toBe('clerk_y');
    expect(body.hyloId).toBeNull();
    expect(updateCapture.set?.role).toBe('admin');
  });

  it('returns 400 when neither hyloId nor clerkId is provided', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
    setupDbMocks({});
    const res = await PATCH(patchReq({ role: 'admin' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
    setupDbMocks({});
    const res = await PATCH(patchReq({ hyloId: 'h-1', role: 'superuser' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when neither hyloId nor clerkId matches a row', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-admin', role: 'admin' } });
    setupDbMocks({ updateReturn: [] });
    const res = await PATCH(patchReq({ clerkId: 'clerk_missing', role: 'host' }));
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-admin', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: 'h-1', role: 'member' } });
    setupDbMocks({});
    const res = await PATCH(patchReq({ clerkId: 'clerk_y', role: 'host' }));
    expect(res.status).toBe(403);
  });
});
