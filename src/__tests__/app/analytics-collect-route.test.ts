/**
 * @jest-environment node
 */

jest.mock('@/lib/db', () => ({ db: { __mock: true } }));

import { GUEST_COOKIE } from '@/lib/guest';
import { POST } from '@/app/api/analytics/collect/route';

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

describe('POST /api/analytics/collect', () => {
  it('records a pageview and returns 204', async () => {
    const inserts = installDb();
    const res = await POST(makeReq({ type: 'pageview', path: '/week', visitorId: 'v1' }));
    expect(res.status).toBe(204);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].type).toBe('pageview');
    expect(inserts[0].path).toBe('/week');
    expect(inserts[0].isGuest).toBe(false);
  });

  it('marks is_guest from the guest cookie', async () => {
    const inserts = installDb();
    await POST(makeReq({ type: 'pageview', path: '/' }, true));
    expect(inserts[0].isGuest).toBe(true);
  });

  it('ignores client-supplied guest_enter (recorded server-side only)', async () => {
    const inserts = installDb();
    const res = await POST(makeReq({ type: 'guest_enter' }));
    expect(res.status).toBe(204);
    expect(inserts).toHaveLength(0);
  });

  it('ignores an invalid payload without inserting', async () => {
    const inserts = installDb();
    const res = await POST(makeReq({ notAType: true }));
    expect(res.status).toBe(204);
    expect(inserts).toHaveLength(0);
  });

  it('records a click with its target', async () => {
    const inserts = installDb();
    await POST(makeReq({ type: 'click', target: 'join-meeting', path: '/week' }));
    expect(inserts[0].type).toBe('click');
    expect(inserts[0].target).toBe('join-meeting');
  });
});
