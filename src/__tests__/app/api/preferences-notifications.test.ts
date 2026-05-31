/**
 * @jest-environment node
 */

import { GET, PUT } from '@/app/api/preferences/notifications/route';

// The route reads identity via getAuthedUser() (canonical AuthedUser shape),
// not auth() directly. Mock that boundary so the test exercises the route's
// real auth read. `id` is the legacy provider-string identity the preferences
// helpers key on (notification_preferences.userId).
jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
// PUT calls revalidatePath('/preferences/notifications'); stub it so it does
// not require a Next request/static-generation store under jest.
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn(() => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) })),
    select: jest.fn(() => ({
      from: () => ({
        where: () => Promise.resolve([{
          userId: 'u1',
          pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
          emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
        }]),
      }),
    })),
    update: jest.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
  },
}));

const { getAuthedUser } = jest.requireMock('@/lib/auth/get-authed-user') as {
  getAuthedUser: jest.Mock;
};

const authedUser = {
  memberId: 1,
  id: 'u1',
  role: 'member' as const,
  name: null,
  image: null,
  logtoUserId: 'u1',
  email: null,
};

describe('GET /api/preferences/notifications', () => {
  it('returns 401 without a session', async () => {
    getAuthedUser.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('returns the lazy-inserted preferences row for the authed user', async () => {
    getAuthedUser.mockResolvedValue(authedUser);
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pushOneHour).toBe(true);
    expect(body.emailFifteenMin).toBe(false);
  });
});

describe('PUT /api/preferences/notifications', () => {
  it('returns 401 without a session', async () => {
    getAuthedUser.mockResolvedValue(null);
    const res = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
  });

  it('rejects non-boolean values with 400', async () => {
    getAuthedUser.mockResolvedValue(authedUser);
    const res = await PUT(new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ pushOneHour: 'yes' }),
    }));
    expect(res.status).toBe(400);
  });

  it('persists boolean updates and returns ok', async () => {
    getAuthedUser.mockResolvedValue(authedUser);
    const res = await PUT(new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ pushOneHour: false, emailOneHour: true }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
