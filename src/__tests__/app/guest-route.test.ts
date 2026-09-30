/**
 * @jest-environment node
 */

jest.mock('@/lib/db', () => ({ db: { __mock: true } }));

import { GET } from '@/app/guest/route';

interface Inserted {
  type: string;
  path: string | null;
  isGuest: boolean;
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

describe('GET /guest', () => {
  it('records guest_enter with the ref from the request URL, even though the redirect drops it', async () => {
    const inserts = installDb();
    const res = await GET(new Request('http://x/guest?ref=Newsletter'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://x/');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ type: 'guest_enter', isGuest: true, viewer: 'guest', ref: 'newsletter' });
  });

  it('records a null ref when none is given, and logs + drops a malformed one', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const inserts = installDb();
    await GET(new Request('http://x/guest'));
    expect(warn).not.toHaveBeenCalled();
    await GET(new Request('http://x/guest?ref=no%20good!'));
    expect(inserts.map((i) => i.ref)).toEqual([null, null]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
