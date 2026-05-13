/**
 * @jest-environment node
 */

jest.mock('../../../../auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/auth/get-current-member', () => ({ getCurrentMember: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: {} }));

jest.mock('@/lib/notifications/muted-with-events', () => ({
  listMutedWithEventDetails: jest.fn(),
}));

import { GET } from '@/app/api/preferences/notifications/muted/route';
import * as authMod from '@/lib/auth/get-authed-user';
import { listMutedWithEventDetails } from '@/lib/notifications/muted-with-events';

describe('GET /api/preferences/notifications/muted', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('returns 401 when unauthenticated', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue(null);
    const res = await GET(new Request('http://x/api/preferences/notifications/muted'));
    expect(res.status).toBe(401);
  });

  test('returns muted events list', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: 7, role: 'member', name: null, image: null });
    (listMutedWithEventDetails as jest.Mock).mockResolvedValue([
      { eventId: 42, title: 'Sauna', startsAt: new Date('2026-06-01T18:00:00Z'), mutedAt: new Date('2026-05-13T10:00:00Z') },
    ]);
    const res = await GET(new Request('http://x/api/preferences/notifications/muted'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.muted).toHaveLength(1);
    expect(body.muted[0]).toMatchObject({ eventId: 42, title: 'Sauna' });
  });
});
