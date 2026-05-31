/**
 * @jest-environment node
 */

jest.mock('@/lib/events/visibility', () => ({
  visibleEventsForMemberCondition: jest.fn(() => ({ __vis: 'member' })),
  publicOnlyEventsCondition: jest.fn(() => ({ __vis: 'public' })),
}));

import { GET } from '@/app/api/calendar/feed.ics/route';
import type { NextRequest } from 'next/server';

const mockEventA = { id: 1, title: 'EventA', startsAt: new Date('2026-06-01T10:00:00Z'), endsAt: null, location: null, description: null, timezone: 'UTC', creatorName: 'Alice', recurrenceRule: null };
const mockEventB = { id: 2, title: 'EventB', startsAt: new Date('2026-06-02T10:00:00Z'), endsAt: null, location: null, description: null, timezone: 'UTC', creatorName: 'Bob', recurrenceRule: null };

// The DB mock must handle three call shapes that appear in different code paths:
//   1. .where().limit()            → member-by-token lookup → [{hyloId: 'u1'}]
//   2a. .where() thenable          → rsvps-eventIds → [{eventId: 1}]  (rsvps-only filter)
//   2b. .where().orderBy()         → all events with visibility → [A, B]  (no filter)
//   3. .where().orderBy()          → events by inArray+visibility → [A]   (after rsvps lookup)
// Shapes 2b and 3 both use .where().orderBy() — we distinguish by call count.
// A hybrid where() result supports both thenable (for rsvps) AND .orderBy() (for events).
let _selectCallCount = 0;

jest.mock('@/lib/db', () => ({
  db: {
    select: () => {
      _selectCallCount++;
      const call = _selectCallCount;
      return {
        from: () => ({
          where: () => {
            if (call === 1) {
              // member lookup — need .limit(); also need .orderBy() for no-token path (call=1 there)
              // Route selects { id, clerkId, logtoId }; supply all three so
              // _memberId (visibility) and _userId (rsvps filter) both resolve.
              return {
                limit: () => Promise.resolve([{ id: 7, logtoId: 'u1', clerkId: null }]),
                orderBy: () => Promise.resolve([mockEventA, mockEventB]),
              };
            }
            if (call === 2) {
              // rsvps lookup (thenable) OR all-events (orderBy) depending on filter
              return {
                orderBy: () => Promise.resolve([mockEventA, mockEventB]),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                then: (resolve: any, reject: any) => Promise.resolve([{ eventId: 1 }]).then(resolve, reject),
              };
            }
            // call 3: events filtered by inArray + visibility (rsvps-only path)
            return {
              orderBy: () => Promise.resolve([mockEventA]),
            };
          },
        }),
      };
    },
  },
}));

beforeEach(() => { _selectCallCount = 0; });

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
