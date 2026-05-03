/**
 * @jest-environment node
 */

import { GET } from '@/app/api/cron/heartbeat-check/route';

const sendEmailMock = jest.fn().mockResolvedValue({ success: true });
jest.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));

let lastSentAt: Date | null = null;
jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ orderBy: () => ({ limit: () => Promise.resolve([{ sentAt: lastSentAt }]) }) }) }),
  },
}));

beforeEach(() => {
  sendEmailMock.mockClear();
  process.env.CRON_SECRET = 'shh';
  process.env.NOTIFICATION_ADMIN_EMAIL = 'admin@example.com';
});

describe('heartbeat-check cron', () => {
  it('returns 401 without bearer auth', async () => {
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('does not email when last log is fresh', async () => {
    lastSentAt = new Date();
    const res = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer shh' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notified).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('emails admin when last log is stale (>30 min)', async () => {
    lastSentAt = new Date(Date.now() - 60 * 60_000);
    const res = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer shh' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notified).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith('admin@example.com', expect.any(String), expect.any(String));
  });
});
