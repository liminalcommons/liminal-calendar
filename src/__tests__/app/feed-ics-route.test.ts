/**
 * @jest-environment node
 *
 * Tests for GET /api/calendar/feed.ics.
 *
 * Focus is the privacy-sensitive Cache-Control header: a token-authenticated
 * feed body may contain private events visible only to the token-holder.
 * `public` cacheing would allow intermediate proxies to serve those bodies
 * to other identities. The expected behavior:
 *
 *   - no token        → Cache-Control: public, max-age=900, s-maxage=900
 *   - token (valid)   → Cache-Control: private, max-age=900
 *   - token (invalid) → Cache-Control: private, max-age=900
 *     (so a guessable token can't be probed via a public edge cache)
 */

jest.mock('@/lib/db', () => ({ db: { __mock: true } }));
jest.mock('@/lib/ics-generator', () => ({
  generateCalendarFeed: jest.fn(() => 'BEGIN:VCALENDAR\nEND:VCALENDAR'),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/calendar/feed.ics/route';

interface DbMockOpts {
  /** Member row to return for the token lookup; null = no match. */
  memberRow?: { id: number; hyloId: string | null; clerkId: string | null } | null;
}

function setupDbMocks(opts: DbMockOpts = {}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };

  // The route makes 1-2 selects:
  //   1) members.feedToken lookup (when token query is present)
  //   2) events (universal) — may also have a rsvps select on rsvps-only filter
  let selectCallIdx = 0;
  dbModule.db.select = jest.fn(() => {
    const idx = selectCallIdx++;
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => {
          if (idx === 0 && opts.memberRow !== undefined) {
            // members lookup (token path)
            return {
              limit: jest.fn(() =>
                Promise.resolve(opts.memberRow === null ? [] : [opts.memberRow]),
              ),
            };
          }
          // events query — returns empty list (we only care about headers).
          const eventsResult: never[] = [];
          // route uses .where(...).orderBy(...) on this chain
          return {
            orderBy: jest.fn(() => Promise.resolve(eventsResult)),
          };
        }),
      })),
    };
  });
}

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

describe('GET /api/calendar/feed.ics — Cache-Control privacy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('no token: Cache-Control allows public proxy caching', async () => {
    setupDbMocks();
    const res = await GET(makeReq('https://example.com/api/calendar/feed.ics'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=900, s-maxage=900');
  });

  it('valid token: Cache-Control is private (no intermediate proxy caching)', async () => {
    setupDbMocks({ memberRow: { id: 1, hyloId: 'hy_1', clerkId: null } });
    const res = await GET(
      makeReq('https://example.com/api/calendar/feed.ics?token=valid-token'),
    );
    expect(res.status).toBe(200);
    const cc = res.headers.get('Cache-Control') ?? '';
    expect(cc).toMatch(/^private/);
    expect(cc).not.toMatch(/public/);
  });

  it('invalid token: Cache-Control is also private (no probing via public cache)', async () => {
    setupDbMocks({ memberRow: null });
    const res = await GET(
      makeReq('https://example.com/api/calendar/feed.ics?token=guessed-bogus-token'),
    );
    expect(res.status).toBe(200);
    const cc = res.headers.get('Cache-Control') ?? '';
    expect(cc).toMatch(/^private/);
    expect(cc).not.toMatch(/public/);
  });
});
