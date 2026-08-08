/**
 * @jest-environment node
 */

jest.mock('@/lib/db', () => ({ db: { __mock: true } }));

import { GUEST_COOKIE } from '@/lib/guest';
import { ANALYTICS_ENDPOINT } from '@/lib/analytics/track';
import { POST as pulsePost } from '@/app/api/pulse/route';
import { POST as legacyPost } from '@/app/api/analytics/collect/route';

interface Inserted {
  type: string;
  path: string | null;
  target: string | null;
  visitorId: string | null;
  isGuest: boolean;
  memberId: number | null;
  referrerHost: string | null;
  device: string | null;
  country: string | null;
  visitId: string | null;
  viewer: string | null;
}

function installDb(): Inserted[] {
  const inserts: Inserted[] = [];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  dbModule.db.insert = () => ({
    values: (v: Inserted) => {
      inserts.push(v);
      return Promise.resolve();
    },
  });
  return inserts;
}

function makeReq(
  body: unknown,
  guest = false,
  headers: Record<string, string> = {},
): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(headers),
    cookies: {
      get: (name: string) => (guest && name === GUEST_COOKIE ? { value: '1' } : undefined),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('analytics beacon endpoint', () => {
  it('the client posts to a path content blockers do not filter', () => {
    expect(ANALYTICS_ENDPOINT).toBe('/api/pulse');
    // Guard the regression directly: these are the tokens EasyPrivacy and
    // uBlock's built-in lists match on, and shipping either one again would
    // silently zero out collection for blocker users.
    expect(ANALYTICS_ENDPOINT).not.toContain('analytics');
    expect(ANALYTICS_ENDPOINT).not.toContain('collect');
  });

  it('/api/pulse records a pageview and returns 204', async () => {
    const inserts = installDb();
    const res = await pulsePost(makeReq({ type: 'pageview', path: '/week', visitorId: 'v1' }));
    expect(res.status).toBe(204);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].type).toBe('pageview');
    expect(inserts[0].path).toBe('/week');
  });

  it('/api/pulse marks is_guest from the guest cookie', async () => {
    const inserts = installDb();
    await pulsePost(makeReq({ type: 'pageview', path: '/' }, true));
    expect(inserts[0].isGuest).toBe(true);
  });

  it('the legacy /api/analytics/collect alias still records, for cached bundles', async () => {
    const inserts = installDb();
    const res = await legacyPost(makeReq({ type: 'click', target: 'join-meeting', path: '/week' }));
    expect(res.status).toBe(204);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].target).toBe('join-meeting');
  });

  it('never surfaces an error to the visitor when the write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
    dbModule.db.insert = () => {
      throw Object.assign(new Error('relation "analytics_events" does not exist'), { code: '42P01' });
    };

    const res = await pulsePost(makeReq({ type: 'pageview', path: '/' }));
    expect(res.status).toBe(204);
    (console.error as jest.Mock).mockRestore();
  });

  it('persists the enrichment the client sends', async () => {
    const inserts = installDb();
    await pulsePost(
      makeReq({
        type: 'pageview',
        path: '/about',
        visitorId: 'v1',
        referrer: 'google.com',
        device: 'mobile',
        visitId: 'visit-1',
      }),
    );
    expect(inserts[0].referrerHost).toBe('google.com');
    expect(inserts[0].device).toBe('mobile');
    expect(inserts[0].visitId).toBe('visit-1');
  });

  it('attaches server-side country and viewer kind, never the IP', async () => {
    const inserts = installDb();
    await pulsePost(
      makeReq({ type: 'pageview', path: '/' }, false, {
        'x-vercel-ip-country': 'GB',
        cookie: '__session=abc.def',
        'x-forwarded-for': '203.0.113.9',
      }),
    );
    expect(inserts[0].country).toBe('GB');
    expect(inserts[0].viewer).toBe('member');
    // The address is available on the request and deliberately not stored.
    expect(JSON.stringify(inserts[0])).not.toContain('203.0.113.9');
  });

  it('marks an unauthenticated guest as guest, and no cookies as anonymous', async () => {
    let inserts = installDb();
    await pulsePost(makeReq({ type: 'pageview', path: '/' }, true));
    expect(inserts[0].viewer).toBe('guest');

    inserts = installDb();
    await pulsePost(makeReq({ type: 'pageview', path: '/' }));
    expect(inserts[0].viewer).toBe('anonymous');
  });

  it('rejects an out-of-range device value rather than storing it', async () => {
    const inserts = installDb();
    // Schema-invalid payloads are dropped whole (204, no row) — the beacon
    // never partially records a malformed event.
    const res = await pulsePost(makeReq({ type: 'pageview', device: 'fridge' }));
    expect(res.status).toBe(204);
    expect(inserts).toHaveLength(0);
  });
});
