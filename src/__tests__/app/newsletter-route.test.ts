/**
 * @jest-environment node
 */

jest.mock('@/lib/db', () => ({ db: { __mock: true } }));
jest.mock('@/lib/auth/get-authed-user', () => ({ getAuthedUser: jest.fn() }));
jest.mock('@/lib/newsletter/repo', () => ({ fetchNewsletterAudience: jest.fn() }));
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { fetchNewsletterAudience } from '@/lib/newsletter/repo';
import { sendEmail } from '@/lib/email';
import { GET, POST } from '@/app/api/admin/newsletter/route';

const mockAuth = getAuthedUser as unknown as jest.Mock;
const mockAudience = fetchNewsletterAudience as unknown as jest.Mock;
const mockSend = sendEmail as unknown as jest.Mock;

function makeReq(body: unknown): import('next/server').NextRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { json: () => Promise.resolve(body) } as any;
}

const audienceFixture = {
  entries: [
    { email: 'a@example.com', name: 'A', sources: ['member'] },
    { email: 'b@example.com', name: null, sources: ['subscriber:rsvp'] },
  ],
  memberCount: 1,
  subscriberCount: 1,
  suppressedCount: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAudience.mockResolvedValue(audienceFixture);
  mockSend.mockResolvedValue({ success: true });
});

describe('/api/admin/newsletter auth gate', () => {
  it('GET returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for a non-admin', async () => {
    mockAuth.mockResolvedValue({ role: 'member' });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('POST returns 403 for a non-admin and never sends', async () => {
    mockAuth.mockResolvedValue({ role: 'host' });
    const res = await POST(makeReq({ subject: 'Hi', body: 'Body' }));
    expect(res.status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('/api/admin/newsletter as admin', () => {
  beforeEach(() => mockAuth.mockResolvedValue({ role: 'admin' }));

  it('GET returns the audience summary', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRecipients).toBe(2);
    expect(body.memberCount).toBe(1);
  });

  it('POST validates that subject and body are present', async () => {
    expect((await POST(makeReq({ body: 'no subject' }))).status).toBe(400);
    expect((await POST(makeReq({ subject: 'no body' }))).status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('POST dryRun reports recipients without sending', async () => {
    const res = await POST(makeReq({ subject: 'Hi', body: 'Body', dryRun: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.wouldSend).toBe(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('POST send delivers one email per recipient', async () => {
    process.env.STOP_TOKEN_SECRET = 'test-secret';
    const res = await POST(makeReq({ subject: 'Hi', body: 'Body' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(2);
    expect(body.failed).toBe(0);
    expect(mockSend).toHaveBeenCalledTimes(2);
    // Each send carries a one-click List-Unsubscribe header.
    const [, , , opts] = mockSend.mock.calls[0];
    expect(opts.headers['List-Unsubscribe']).toContain('/api/newsletter/unsubscribe');
  });
});

describe('/api/admin/newsletter — missing schema', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ memberId: 1, id: 'logto-admin', role: 'admin', name: 'Admin' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore?.();
  });

  it('reports schemaMissing instead of a 500 when newsletter_subscribers is absent', async () => {
    // newsletter_subscribers is declared behind two failable UNIQUE statements
    // in the migration chain, so a partial migration leaves it missing. The
    // error arrives wrapped by Drizzle, with the pg code on `.cause`.
    mockAudience.mockRejectedValue(
      Object.assign(new Error('Failed query: select ... from "newsletter_subscribers"'), {
        cause: Object.assign(new Error('relation "newsletter_subscribers" does not exist'), {
          code: '42P01',
        }),
      }),
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.schemaMissing).toBe(true);
    // Zeroed rather than absent, so the panel renders a repair prompt instead
    // of an audience that looks like "nobody has signed up".
    expect(body.totalRecipients).toBe(0);
  });

  it('still 500s on an unrelated database error', async () => {
    mockAudience.mockRejectedValue(
      Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }),
    );
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to load audience');
  });
});
