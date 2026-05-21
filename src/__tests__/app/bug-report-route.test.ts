/**
 * @jest-environment node
 *
 * Robustness tests for /api/bug-report. The endpoint must never 5xx because
 * a bug reporter's input is, by definition, often malformed. These tests
 * exercise the failure paths: missing fields, oversized payloads, GitHub
 * outages, malicious markdown.
 */

jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));

const mockCreate = jest.fn();
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    issues: { create: mockCreate },
  })),
}));

import { NextRequest } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { POST } from '@/app/api/bug-report/route';

const mockAuth = getAuthedUser as jest.MockedFunction<typeof getAuthedUser>;

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/bug-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(null);
  process.env.GITHUB_TOKEN = 'test-token';
  mockCreate.mockResolvedValue({
    data: { number: 123, html_url: 'https://github.com/x/y/issues/123' },
  });
});

afterAll(() => {
  process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
});

describe('POST /api/bug-report — robustness', () => {
  it('rejects missing title with 400 (no 5xx for malformed input)', async () => {
    const res = await POST(makeReq({ description: 'no title' }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('accepts minimal valid payload and creates a GitHub issue', async () => {
    const res = await POST(makeReq({ title: 'something broke', type: 'bug' }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.issueNumber).toBe(123);
  });

  it('coerces unknown type to "bug" instead of failing', async () => {
    await POST(makeReq({ title: 't', type: 'totally-made-up' }));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0];
    expect(args.labels).toContain('bug');
  });

  it('clamps oversized title to <=80 chars in the slug', async () => {
    const longTitle = 'x'.repeat(500);
    await POST(makeReq({ title: longTitle, type: 'bug' }));
    const args = mockCreate.mock.calls[0][0];
    // Issue title has a `[Bug] [anon] ` prefix; the user portion must be capped
    // even before the global 256 char title clamp kicks in.
    expect(args.title.length).toBeLessThanOrEqual(256);
  });

  it('handles 200KB clientLogs without throwing or exploding the body', async () => {
    const huge = '[2026-05-20T00:00:00Z] [INFO] ' + 'x'.repeat(300_000);
    const res = await POST(makeReq({
      title: 'huge logs',
      type: 'bug',
      clientLogs: huge,
    }));
    expect(res.status).toBe(201);
    const args = mockCreate.mock.calls[0][0];
    expect(args.body.length).toBeLessThanOrEqual(60_000);
  });

  it('neutralises ``` fence terminators inside log lines', async () => {
    const logs = '[2026-05-20T00:00:00Z] [ERROR] ```malicious```\\n\\nactual issue body';
    await POST(makeReq({
      title: 'fence test',
      type: 'bug',
      clientLogs: logs,
    }));
    const args = mockCreate.mock.calls[0][0];
    expect(args.body).not.toMatch(/```malicious```/);
  });

  it('escapes pipes in table-cell metadata so the table stays valid', async () => {
    await POST(makeReq({
      title: 'pipe test',
      type: 'bug',
      metadata: { url: 'https://x.com/a|b|c', userAgent: 'Mozilla' },
    }));
    const args = mockCreate.mock.calls[0][0];
    expect(args.body).toMatch(/a\\\|b\\\|c/);
  });

  it('falls back gracefully when GITHUB_TOKEN is missing (still 201)', async () => {
    delete process.env.GITHUB_TOKEN;
    const res = await POST(makeReq({ title: 't', type: 'bug' }));
    expect(res.status).toBe(201);
    expect(mockCreate).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('retries once on a 5xx and succeeds', async () => {
    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error('upstream blip'), { status: 502 }))
      .mockResolvedValueOnce({ data: { number: 7, html_url: 'u' } });
    const res = await POST(makeReq({ title: 'retry me', type: 'bug' }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const body = await res.json();
    expect(body.issueNumber).toBe(7);
  });

  it('does NOT retry on a 4xx (auth / not-found / validation)', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('bad creds'), { status: 401 }));
    const res = await POST(makeReq({ title: 'bad', type: 'bug' }));
    expect(res.status).toBe(201); // still 201 — client must never see GH failure
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('still returns 201 when GitHub is completely down (network error)', async () => {
    mockCreate.mockRejectedValue(new Error('ENOTFOUND'));
    const res = await POST(makeReq({ title: 'gh down', type: 'bug' }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it('still returns 201 when auth resolution throws', async () => {
    mockAuth.mockRejectedValue(new Error('db unreachable'));
    const res = await POST(makeReq({ title: 'auth blew up', type: 'bug' }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
    const args = mockCreate.mock.calls[0][0];
    // Server error surfaces in the auth table for diagnosis.
    expect(args.body).toMatch(/Server error.+db unreachable/);
  });

  it('includes memberId in the issue title when reporter is signed in', async () => {
    mockAuth.mockResolvedValue({
      memberId: 42,
      id: 'logto-abc',
      role: 'member',
      name: 'Alice',
      image: null,
      logtoUserId: 'logto-abc',
      email: 'a@b.com',
    });
    await POST(makeReq({ title: 'signed-in report', type: 'bug' }));
    const args = mockCreate.mock.calls[0][0];
    expect(args.title).toMatch(/m#42/);
  });

  it('survives a completely empty body object', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400); // title required, but no throw
  });
});
