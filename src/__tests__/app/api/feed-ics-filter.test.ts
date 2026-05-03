/**
 * @jest-environment node
 */

import { GET } from '@/app/api/calendar/feed.ics/route';
import type { NextRequest } from 'next/server';

const mockEventA = { id: 1, title: 'EventA', startsAt: new Date('2026-06-01T10:00:00Z'), endsAt: null, location: null, description: null, timezone: 'UTC', creatorName: 'Alice', recurrenceRule: null };
const mockEventB = { id: 2, title: 'EventB', startsAt: new Date('2026-06-02T10:00:00Z'), endsAt: null, location: null, description: null, timezone: 'UTC', creatorName: 'Bob', recurrenceRule: null };

// Polymorphic where() chain — supports all three real call shapes:
//   1. .where().limit()           → member lookup       → [{hyloId: 'u1'}]
//   2. .where()  (await directly) → rsvps-eventIds      → [{eventId: 1}]  (only EventA RSVPed)
//   3. .where().orderBy()         → events filtered by ids → [mockEventA]
// The thenable `then` makes `await where(...)` resolve directly to the rsvps-eventIds array;
// `.limit()` and `.orderBy()` are also available on the same object for chaining.
const polymorphicWhere = {
  limit: () => Promise.resolve([{ hyloId: 'u1' }]),
  orderBy: () => Promise.resolve([mockEventA]),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then: (resolve: any, reject: any) => Promise.resolve([{ eventId: 1 }]).then(resolve, reject),
};

jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (_table: unknown) => ({
        // member-by-token lookup, rsvps-eventIds, OR events-filtered all enter here
        where: () => polymorphicWhere,
        // unfiltered events path: select().from(events).orderBy()
        orderBy: () => Promise.resolve([mockEventA, mockEventB]),
      }),
    }),
  },
}));

function makeReq(qs: string) {
  return { nextUrl: new URL(`http://localhost/api/calendar/feed.ics?${qs}`) } as unknown as NextRequest;
}

describe('ICS feed filter param', () => {
  it('returns all events when filter is absent', async () => {
    const res = await GET(makeReq('token=tk1'));
    const body = await res.text();
    expect(body).toContain('EventA');
    expect(body).toContain('EventB');
  });

  it('returns only RSVPed events when filter=rsvps-only and token is valid', async () => {
    const res = await GET(makeReq('token=tk1&filter=rsvps-only'));
    const body = await res.text();
    expect(body).toContain('EventA');
    expect(body).not.toContain('EventB');
  });

  it('falls back to all events when filter=rsvps-only but token is invalid (no member)', async () => {
    const res = await GET(makeReq('filter=rsvps-only'));
    expect(res.status).toBe(200);
  });
});
