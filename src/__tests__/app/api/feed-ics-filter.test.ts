/**
 * @jest-environment node
 */

import { GET } from '@/app/api/calendar/feed.ics/route';
import type { NextRequest } from 'next/server';

const mockEventA = { id: 1, title: 'EventA', startsAt: new Date('2026-06-01T10:00:00Z'), endsAt: null, location: null, description: null, timezone: 'UTC', creatorName: 'Alice', recurrenceRule: null };
const mockEventB = { id: 2, title: 'EventB', startsAt: new Date('2026-06-02T10:00:00Z'), endsAt: null, location: null, description: null, timezone: 'UTC', creatorName: 'Bob', recurrenceRule: null };

jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (_table: unknown) => ({
        // member-by-token lookup: select().from(members).where().limit()
        where: () => ({ limit: () => Promise.resolve([{ hyloId: 'u1' }]) }),
        // filtered RSVPs-only path uses innerJoin
        innerJoin: () => ({
          where: () => Promise.resolve([mockEventA]),
        }),
        // unfiltered path: select().from(events).orderBy()
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
