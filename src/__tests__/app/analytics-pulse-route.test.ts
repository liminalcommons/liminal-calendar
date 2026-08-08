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

function makeReq(body: unknown, guest = false): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
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
});
