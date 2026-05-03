import { GET, PUT } from '@/app/api/preferences/notifications/route';

jest.mock('@/../auth', () => ({
  auth: jest.fn(),
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

const { auth } = jest.requireMock('@/../auth') as { auth: jest.Mock };

describe('GET /api/preferences/notifications', () => {
  it('returns 401 without a session', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('returns the lazy-inserted preferences row for the authed user', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', hyloId: 'u1' } });
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pushOneHour).toBe(true);
    expect(body.emailFifteenMin).toBe(false);
  });
});

describe('PUT /api/preferences/notifications', () => {
  it('returns 401 without a session', async () => {
    auth.mockResolvedValue(null);
    const res = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
  });

  it('rejects non-boolean values with 400', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', hyloId: 'u1' } });
    const res = await PUT(new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ pushOneHour: 'yes' }),
    }));
    expect(res.status).toBe(400);
  });

  it('persists boolean updates and returns ok', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', hyloId: 'u1' } });
    const res = await PUT(new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ pushOneHour: false, emailOneHour: true }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
