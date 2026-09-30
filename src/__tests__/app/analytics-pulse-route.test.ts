/**
 * @jest-environment node
 */

jest.mock('@/lib/db', () => ({ db: { __mock: true } }));

import { GUEST_COOKIE } from '@/lib/guest';
import { ANALYTICS_ENDPOINT } from '@/lib/analytics/track';
import { POST as pulsePost } from '@/app/api/pulse/route';
import { resetRefColumnDetection } from '@/lib/analytics/events';
import { analyticsEvents, analyticsEventsPreRef } from '@/lib/db/schema';
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
  ref: string | null;
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

describe('ref attribution capture', () => {
  it('lifts ?ref= from the beaconed path into its own column and cleans the path', async () => {
    const inserts = installDb();
    await pulsePost(makeReq({ type: 'pageview', path: '/events/12?ref=Newsletter', visitorId: 'v1' }));
    expect(inserts[0].path).toBe('/events/12');
    expect(inserts[0].ref).toBe('newsletter');
  });

  it('stores null (direct/unknown) when there is no ref', async () => {
    const inserts = installDb();
    await pulsePost(makeReq({ type: 'pageview', path: '/week' }));
    expect(inserts[0].ref).toBeNull();
  });

  it('drops malformed or oversized refs rather than storing arbitrary text', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const inserts = installDb();
    await pulsePost(makeReq({ type: 'pageview', path: '/?ref=<script>x</script>' }));
    await pulsePost(makeReq({ type: 'pageview', path: `/?ref=${'a'.repeat(40)}` }));
    expect(inserts[0].ref).toBeNull();
    expect(inserts[1].ref).toBeNull();
    warn.mockRestore();
  });

  it('keeps unrelated query params and works on the legacy alias', async () => {
    const inserts = installDb();
    await legacyPost(makeReq({ type: 'pageview', path: '/week?a=1&ref=discord' }));
    expect(inserts[0].path).toBe('/week?a=1');
    expect(inserts[0].ref).toBe('discord');
  });
});

describe('rejected ref logging', () => {
  it('warns (server-side only) when a ref tag is rejected, and stays quiet otherwise', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const inserts = installDb();
    await pulsePost(makeReq({ type: 'pageview', path: '/?ref=Bad Tag!' }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('rejected ref');
    // Logged, never stored.
    expect(inserts[0].ref).toBeNull();
    expect(JSON.stringify(inserts[0])).not.toContain('bad tag');

    warn.mockClear();
    await pulsePost(makeReq({ type: 'pageview', path: '/?ref=newsletter' }));
    await pulsePost(makeReq({ type: 'pageview', path: '/week' }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('deploy safety: ref column not migrated yet', () => {
  const missingRef = () =>
    Object.assign(new Error('Failed query: insert ...'), {
      cause: Object.assign(new Error('column "ref" of relation "analytics_events" does not exist'), {
        code: '42703',
      }),
    });

  function installDriftedDb() {
    const calls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
    dbModule.db.insert = (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        calls.push({ table, values });
        // The real table has no ref column: any insert that names it fails.
        return table === analyticsEvents ? Promise.reject(missingRef()) : Promise.resolve();
      },
    });
    return calls;
  }

  beforeEach(() => {
    resetRefColumnDetection();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    (console.warn as jest.Mock).mockRestore();
  });

  it('retries without ref so the event is recorded, not dropped', async () => {
    const calls = installDriftedDb();
    const res = await pulsePost(makeReq({ type: 'pageview', path: '/week?ref=discord', visitorId: 'v1' }));
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(2);
    expect(calls[1].table).toBe(analyticsEventsPreRef);
    expect(calls[1].values).toMatchObject({ type: 'pageview', path: '/week', visitorId: 'v1' });
    expect(calls[1].values).not.toHaveProperty('ref');
  });

  it('skips the failing probe on later events, then re-probes after the window', async () => {
    const calls = installDriftedDb();
    await pulsePost(makeReq({ type: 'pageview', path: '/a' }));
    await pulsePost(makeReq({ type: 'pageview', path: '/b' }));
    // 1st event: probe + fallback; 2nd event: fallback only.
    expect(calls.map((c) => c.table === analyticsEvents)).toEqual([true, false, false]);

    const realNow = Date.now;
    Date.now = () => realNow() + 120_000;
    try {
      await pulsePost(makeReq({ type: 'pageview', path: '/c' }));
    } finally {
      Date.now = realNow;
    }
    expect(calls[3].table).toBe(analyticsEvents);
  });

  it('does not mask other insert failures as a missing ref column', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const calls: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
    dbModule.db.insert = (table: unknown) => ({
      values: () => {
        calls.push(table);
        return Promise.reject(new Error('connection terminated'));
      },
    });
    const res = await pulsePost(makeReq({ type: 'pageview', path: '/' }));
    expect(res.status).toBe(204);
    expect(calls).toEqual([analyticsEvents]); // no fallback attempt
    (console.error as jest.Mock).mockRestore();
  });
});
