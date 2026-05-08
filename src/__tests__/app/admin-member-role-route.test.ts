/**
 * @jest-environment node
 */

jest.mock('../../../auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));

import { NextRequest } from 'next/server';
import { auth } from '../../../auth';
import { db } from '@/lib/db';
import { POST } from '@/app/api/admin/members/[id]/role/route';

const mockAuth = auth as unknown as jest.Mock;

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function makeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/members/[id]/role', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as any);
    const res = await POST(makeRequest({ role: 'host' }), makeContext('1'));
    expect(res.status).toBe(401);
  });

  it('403 when caller is host', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'host', hyloId: '1' } } as any);
    const res = await POST(makeRequest({ role: 'host' }), makeContext('2'));
    expect(res.status).toBe(403);
  });

  it('403 when caller is member', async () => {
    mockAuth.mockResolvedValue({ user: { hyloId: '1' } } as any);
    const res = await POST(makeRequest({ role: 'host' }), makeContext('2'));
    expect(res.status).toBe(403);
  });

  it('400 on invalid JSON body', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'admin', hyloId: '1' } } as any);
    const req = { json: async () => { throw new Error('bad json'); } } as unknown as NextRequest;
    const res = await POST(req, makeContext('2'));
    expect(res.status).toBe(400);
  });

  it('400 on invalid role value', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'admin', hyloId: '1' } } as any);
    const res = await POST(makeRequest({ role: 'wizard' }), makeContext('2'));
    expect(res.status).toBe(400);
  });

  it('400 on non-numeric member id', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'admin', hyloId: '1' } } as any);
    const res = await POST(makeRequest({ role: 'host' }), makeContext('abc'));
    expect(res.status).toBe(400);
  });

  it('200 + updates member role when caller is admin', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'admin', hyloId: '1' } } as any);
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
    mockAuth.mockResolvedValue({ user: { role: 'admin', hyloId: '1' } } as any);
    const returning = jest.fn().mockResolvedValue([]);
    const where = jest.fn(() => ({ returning }));
    const set = jest.fn(() => ({ where }));
    (db as any).update = jest.fn(() => ({ set }));

    const res = await POST(makeRequest({ role: 'host' }), makeContext('999'));
    expect(res.status).toBe(404);
  });
});
