/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { GET, PATCH, POST } from '@/app/api/admin/members/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;

// Canonical authed-user shapes the route reads (role gate + identity).
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

interface UpdateCapture {
  set?: Record<string, unknown>;
  whereCalled?: boolean;
}

interface InsertCapture {
  values?: Record<string, unknown>;
  conflictTarget?: unknown;
  conflictSet?: Record<string, unknown>;
}

function setupDbMocks(opts: {
  selectRows?: unknown[];
  updateReturn?: unknown[];
  updateCapture?: UpdateCapture;
  insertReturn?: unknown[];
  insertCapture?: InsertCapture;
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

  dbModule.db.insert = () => ({
    values: (v: Record<string, unknown>) => {
      if (opts.insertCapture) opts.insertCapture.values = v;
      return {
        onConflictDoUpdate: (cfg: { target: unknown; set: Record<string, unknown> }) => {
          if (opts.insertCapture) {
            opts.insertCapture.conflictTarget = cfg.target;
            opts.insertCapture.conflictSet = cfg.set;
          }
          return {
            returning: () => Promise.resolve(opts.insertReturn ?? []),
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

  it('returns all members for admin (Logto + Clerk-only rows)', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    const logtoMember = { id: 1, logtoId: 'logto-1', clerkId: null, name: 'Logto' };
    const clerkMember = { id: 2, logtoId: null, clerkId: 'clerk_x', name: 'Clerk' };
    setupDbMocks({ selectRows: [logtoMember, clerkMember] });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].clerkId).toBeNull();
    expect(body[1].logtoId).toBeNull();
    expect(body[1].clerkId).toBe('clerk_x');
  });

  it('returns 401 when no session', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    setupDbMocks({});
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    mockGetAuthedUser.mockResolvedValue(memberUser);
    setupDbMocks({});
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates role for a Logto-keyed member (existing behavior)', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    const updateCapture: UpdateCapture = {};
    const updated = { id: 7, logtoId: 'logto-1', clerkId: null, role: 'host' };
    setupDbMocks({ updateReturn: [updated], updateCapture });

    const res = await PATCH(patchReq({ logtoId: 'logto-1', role: 'host' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('host');
    expect(updateCapture.set?.role).toBe('host');
    expect(updateCapture.whereCalled).toBe(true);
  });

  it('updates role for a Clerk-only member (new behavior)', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    const updateCapture: UpdateCapture = {};
    const updated = { id: 9, logtoId: null, clerkId: 'clerk_y', role: 'admin' };
    setupDbMocks({ updateReturn: [updated], updateCapture });

    const res = await PATCH(patchReq({ clerkId: 'clerk_y', role: 'admin' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('admin');
    expect(body.clerkId).toBe('clerk_y');
    expect(body.logtoId).toBeNull();
    expect(updateCapture.set?.role).toBe('admin');
  });

  it('returns 400 when neither logtoId nor clerkId is provided', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupDbMocks({});
    const res = await PATCH(patchReq({ role: 'admin' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupDbMocks({});
    const res = await PATCH(patchReq({ logtoId: 'logto-1', role: 'superuser' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when neither logtoId nor clerkId matches a row', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupDbMocks({ updateReturn: [] });
    const res = await PATCH(patchReq({ clerkId: 'clerk_missing', role: 'host' }));
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-admin', async () => {
    mockGetAuthedUser.mockResolvedValue(memberUser);
    setupDbMocks({});
    const res = await PATCH(patchReq({ clerkId: 'clerk_y', role: 'host' }));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a Logto member when only logtoId is provided (existing behavior)', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    const insertCapture: InsertCapture = {};
    const created = { id: 50, logtoId: 'logto-new', clerkId: null, name: 'NewLogto', role: 'host' };
    setupDbMocks({ insertReturn: [created], insertCapture });

    const res = await POST(patchReq({ logtoId: 'logto-new', name: 'NewLogto', role: 'host' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.logtoId).toBe('logto-new');
    expect(insertCapture.values?.logtoId).toBe('logto-new');
    expect(insertCapture.values?.clerkId).toBeUndefined();
  });

  it('creates a Clerk-only member when only clerkId is provided (new behavior)', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    const insertCapture: InsertCapture = {};
    const created = { id: 51, logtoId: null, clerkId: 'clerk_new', name: 'NewClerk', role: 'host' };
    setupDbMocks({ insertReturn: [created], insertCapture });

    const res = await POST(patchReq({ clerkId: 'clerk_new', name: 'NewClerk', role: 'host' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.clerkId).toBe('clerk_new');
    expect(body.logtoId).toBeNull();
    expect(insertCapture.values?.clerkId).toBe('clerk_new');
    expect(insertCapture.values?.logtoId).toBeUndefined();
  });

  it('returns 400 when neither logtoId nor clerkId is provided', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupDbMocks({});
    const res = await POST(patchReq({ name: 'Orphan', role: 'host' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is missing', async () => {
    mockGetAuthedUser.mockResolvedValue(adminUser);
    setupDbMocks({});
    const res = await POST(patchReq({ clerkId: 'clerk_x', role: 'host' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    setupDbMocks({});
    const res = await POST(patchReq({ clerkId: 'clerk_x', name: 'X', role: 'host' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    mockGetAuthedUser.mockResolvedValue(memberUser);
    setupDbMocks({});
    const res = await POST(patchReq({ clerkId: 'clerk_x', name: 'X', role: 'host' }));
    expect(res.status).toBe(403);
  });
});
