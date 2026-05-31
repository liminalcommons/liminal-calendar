/**
 * @jest-environment node
 */

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('../../../../auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/auth/get-current-member', () => ({ getCurrentMember: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));

import { POST, DELETE } from '@/app/api/events/[id]/mute/route';
import * as authMod from '@/lib/auth/get-authed-user';
import * as repoMod from '@/lib/notifications/mute-repo';

describe('/api/events/[id]/mute', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('POST returns 401 when unauthenticated', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue(null);
    const req = new Request('http://x/api/events/42/mute', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(401);
  });

  test('POST returns 400 when memberId is null on session', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: null, role: 'member', name: null, image: null });
    const req = new Request('http://x/api/events/42/mute', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(400);
  });

  test('POST returns 400 when event id is not a number', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: 7, role: 'member', name: null, image: null });
    const req = new Request('http://x/api/events/abc/mute', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(400);
  });

  test('POST calls muteSeries with memberId and eventId', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: 7, role: 'member', name: null, image: null });
    const muteSpy = jest.spyOn(repoMod, 'muteSeries').mockResolvedValue();
    const req = new Request('http://x/api/events/42/mute', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(200);
    expect(muteSpy).toHaveBeenCalledWith(expect.anything(), 7, 42);
    expect(await res.json()).toEqual({ muted: true, eventId: 42 });
  });

  test('DELETE calls unmuteSeries', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: 7, role: 'member', name: null, image: null });
    const unmuteSpy = jest.spyOn(repoMod, 'unmuteSeries').mockResolvedValue();
    const req = new Request('http://x/api/events/42/mute', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(200);
    expect(unmuteSpy).toHaveBeenCalledWith(expect.anything(), 7, 42);
    expect(await res.json()).toEqual({ muted: false, eventId: 42 });
  });
});
