import { PgDialect } from 'drizzle-orm/pg-core';
import { fetchFunnelDbCounts } from '@/lib/analytics/repo';

describe('fetchFunnelDbCounts', () => {
  it('excludes declined (status no) RSVPs from the guest-RSVP count', async () => {
    const wheres: unknown[] = [];
    const db = {
      select: () => ({
        from: () => ({
          where: (w: unknown) => {
            wheres.push(w);
            return Promise.resolve([{ c: 2 }]);
          },
        }),
      }),
    };
    const out = await fetchFunnelDbCounts(db, Date.now(), 30);
    expect(out).toEqual({ guestRsvps: 2, newMembers: 2 });

    // wheres[0] is the rsvps query.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = new PgDialect().sqlToQuery(wheres[0] as any);
    expect(q.sql).toContain('"rsvps"."member_id" is null');
    expect(q.sql).toContain('"rsvps"."status" <> $');
    expect(q.params).toContain('no');
  });
});
