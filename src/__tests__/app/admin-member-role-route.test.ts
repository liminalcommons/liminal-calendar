/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/get-authed-user', () => ({ getAuthedUser: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));
// The route calls revalidatePath('/admin') on the success path; outside a
// Next.js request context it throws "static generation store missing".
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { POST } from '@/app/api/admin/members/[id]/role/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;

// Canonical authed-user shape the route reads (role gate via canPromoteMembers
// + caller.id for the audit log line).
function authedUser(role: 'member' | 'host' | 'admin') {
  return {
    memberId: 1,
    id: 'logto-1',
    role,
    name: 'Caller',
    image: null,
    logtoUserId: 'logto-1',
  };
}

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function makeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/members/[id]/role', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('401 when unauthenticated', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    const res = await POST(makeRequest({ role: 'host' }), makeContext('1'));
    expect(res.status).toBe(401);
  });

  it('403 when caller is host', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser('host'));
    const res = await POST(makeRequest({ role: 'host' }), makeContext('2'));
    expect(res.status).toBe(403);
  });

  it('403 when caller is member', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser('member'));
    const res = await POST(makeRequest({ role: 'host' }), makeContext('2'));
    expect(res.status).toBe(403);
  });

  it('400 on invalid JSON body', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser('admin'));
    const req = { json: async () => { throw new Error('bad json'); } } as unknown as NextRequest;
    const res = await POST(req, makeContext('2'));
    expect(res.status).toBe(400);
  });

  it('400 on invalid role value', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser('admin'));
    const res = await POST(makeRequest({ role: 'wizard' }), makeContext('2'));
    expect(res.status).toBe(400);
  });

  it('400 on non-numeric member id', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser('admin'));
    const res = await POST(makeRequest({ role: 'host' }), makeContext('abc'));
    expect(res.status).toBe(400);
  });

  it('200 + updates member role when caller is admin', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser('admin'));
    const returning = jest.fn().mockResolvedValue([{ id: 2, role: 'host' }]);
    const where = jest.fn(() => ({ returning }));
    const set = jest.fn(() => ({ where }));
    (db as any).update = jest.fn(() => ({ set }));

    const res = await POST(makeRequest({ role: 'host' }), makeContext('2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 2, role: 'host' });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ role: 'host' }));
  });

  it('404 when member not found', async () => {
    mockGetAuthedUser.mockResolvedValue(authedUser('admin'));
    const returning = jest.fn().mockResolvedValue([]);
    const where = jest.fn(() => ({ returning }));
    const set = jest.fn(() => ({ where }));
    (db as any).update = jest.fn(() => ({ set }));

    const res = await POST(makeRequest({ role: 'host' }), makeContext('999'));
    expect(res.status).toBe(404);
  });
});
