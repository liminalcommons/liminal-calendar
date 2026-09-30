import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { fetchScoreboardEvents } from '@/lib/analytics/repo';
import {
  buildEventScoreboard,
  computeEventTraffic,
  countDistinctEventViewers,
  parseEventId,
  TRAFFIC_DAYS,
  type AnalyticsRow,
  type ScoreboardEvent,
} from '@/lib/analytics/aggregate';

const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(NOW + d * DAY).toISOString();

function pv(path: string | null, visitorId: string | null, opts: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return {
    type: 'pageview', path, target: null, visitorId, isGuest: false,
    createdAt: daysFromNow(-1), ...opts,
  };
}

describe('parseEventId', () => {
  it.each([
    ['/events/42', 42],
    ['/events/42/', 42],
    ['/events/42?utm=x&y=1', 42],
    ['/events/42#comments', 42],
    ['/events/42/?a=1#b', 42],
  ])('parses %s → %s', (path, id) => {
    expect(parseEventId(path)).toBe(id);
  });

  it.each([
    '/events/new', '/events/abc', '/events/42abc', '/events/42/edit', '/events/', '/events',
    '/events/0', '/events/-3', '/events/99999999999', '/admin/events/42', '/', '', null, undefined,
  ])('ignores %p', (path) => {
    expect(parseEventId(path as string | null | undefined)).toBeNull();
  });
});

describe('computeEventTraffic', () => {
  const since = NOW - 30 * DAY;

  it('joins paths to event ids, counting views, distinct viewers and top ref', () => {
    const rows = [
      pv('/events/1', 'a', { ref: 'discord' }),
      pv('/events/1?x=1', 'a', { ref: 'discord' }), // same viewer, query stripped
      pv('/events/1#rsvp', 'b', { ref: 'newsletter' }),
      pv('/events/1', 'c', { ref: 'discord' }),
      pv('/events/2', 'a'),
      pv('/events/new', 'a'), // non-numeric → ignored
      pv('/calendar', 'a'),
    ];
    const t = computeEventTraffic(rows, since, NOW);
    expect(t.size).toBe(2);
    expect(t.get(1)).toEqual({ views: 4, viewers: 3, topRef: 'discord' });
    expect(t.get(2)).toEqual({ views: 1, viewers: 1, topRef: null });
  });

  it('excludes internal rows, non-pageviews and rows outside the window', () => {
    const rows: AnalyticsRow[] = [
      pv('/events/1', 'a'),
      pv('/events/1', 'adm', { target: 'admin:self-test' }),
      pv('/admin/events/1', 'adm'),
      { ...pv('/events/1', 'a'), type: 'click' },
      pv('/events/1', 'old', { createdAt: daysFromNow(-45) }),
      pv('/events/1', 'future', { createdAt: daysFromNow(2) }),
    ];
    expect(computeEventTraffic(rows, since, NOW).get(1)).toEqual({ views: 1, viewers: 1, topRef: null });
  });

  it('counts keyless rows as one viewer each and falls back to visit id', () => {
    const rows = [
      pv('/events/1', null),
      pv('/events/1', null),
      pv('/events/1', null, { visitId: 'v9' }),
      pv('/events/1', null, { visitId: 'v9' }),
    ];
    expect(computeEventTraffic(rows, since, NOW).get(1)).toMatchObject({ views: 4, viewers: 3 });
  });

  it('counts over the fixed 44-day range regardless of the 7/30/90 selector', () => {
    const fixedSince = NOW - TRAFFIC_DAYS * DAY;
    expect(TRAFFIC_DAYS).toBe(44);
    const rows = [
      pv('/events/1', 'a', { createdAt: daysFromNow(-40) }), // outside 30d, inside 44d
      pv('/events/1', 'b', { createdAt: daysFromNow(-43) }),
      pv('/events/1', 'c', { createdAt: daysFromNow(-45) }), // outside 44d
    ];
    expect(computeEventTraffic(rows, fixedSince, NOW).get(1)).toMatchObject({ views: 2, viewers: 2 });
    expect(computeEventTraffic(rows, NOW - 7 * DAY, NOW).get(1)).toBeUndefined();
  });

  it('breaks top-ref ties alphabetically', () => {
    const rows = [pv('/events/1', 'a', { ref: 'signal' }), pv('/events/1', 'b', { ref: 'discord' })];
    expect(computeEventTraffic(rows, since, NOW).get(1)?.topRef).toBe('discord');
  });
});

describe('buildEventScoreboard', () => {
  const ev = (id: number, startsInDays: number, title = `E${id}`): ScoreboardEvent => ({
    id, title, startsAt: daysFromNow(startsInDays),
  });

  it('splits upcoming (next 14d) from past (last 30d) and drops the rest', () => {
    const events = [
      ev(1, 3), ev(2, 14), ev(3, 14.5), ev(4, -0.5), ev(5, -30), ev(6, -31), ev(7, 1),
    ];
    const sb = buildEventScoreboard(events, new Map(), new Map(), NOW);
    expect(sb.upcoming.map((r) => r.id)).toEqual([7, 1, 2]); // soonest first
    expect(sb.past.map((r) => r.id)).toEqual([4, 5]); // newest first
  });

  it('treats an event starting exactly now as past', () => {
    const sb = buildEventScoreboard([ev(1, 0)], new Map(), new Map(), NOW);
    expect(sb.upcoming).toEqual([]);
    expect(sb.past.map((r) => r.id)).toEqual([1]);
  });

  it('carries id and title, and keeps zero-view events that have RSVPs', () => {
    const traffic = new Map([[1, { views: 5, viewers: 3, topRef: 'discord' }]]);
    const rsvps = new Map([
      [1, { yes: 2, interested: 1, guest: 1 }],
      [2, { yes: 0, interested: 4, guest: 4 }],
    ]);
    const sb = buildEventScoreboard([ev(1, 2, 'Circle'), ev(2, 3, 'Sauna')], traffic, rsvps, NOW);
    expect(sb.upcoming[0]).toEqual({
      id: 1, title: 'Circle', startsAt: daysFromNow(2), timezone: 'UTC',
      views: 5, viewers: 3, yes: 2, interested: 1, guestRsvps: 1, topRef: 'discord',
    });
    expect(sb.upcoming[1]).toMatchObject({
      id: 2, views: 0, viewers: 0, yes: 0, interested: 4, guestRsvps: 4, topRef: null,
    });
  });

  it('lists events with neither views nor RSVPs as zero rows', () => {
    const sb = buildEventScoreboard([ev(9, 5)], new Map(), new Map(), NOW);
    expect(sb.upcoming[0]).toMatchObject({ id: 9, views: 0, yes: 0, guestRsvps: 0 });
  });

  it('skips events with an unparseable start', () => {
    const bad: ScoreboardEvent = { id: 1, title: 'x', startsAt: 'nope' };
    expect(buildEventScoreboard([bad], new Map(), new Map(), NOW)).toEqual({
      upcoming: [], past: [], upcomingViewers: null, pastViewers: null,
    });
  });

  it('carries the event timezone, defaulting to UTC', () => {
    const sb = buildEventScoreboard(
      [{ ...ev(1, 2), timezone: 'America/Los_Angeles' }, ev(2, 3)], new Map(), new Map(), NOW,
    );
    expect(sb.upcoming.map((r) => r.timezone)).toEqual(['America/Los_Angeles', 'UTC']);
  });

  it('total viewers is distinct across events, not the sum of rows', () => {
    const rows = [
      pv('/events/1', 'a'), pv('/events/2', 'a'), pv('/events/3', 'a'), // one person, three events
      pv('/events/1', 'b'),
      pv('/events/9', 'z'), // event not on the board
      pv('/events/1', 'adm', { target: 'admin:self-test' }), // internal
      pv('/events/1', 'old', { createdAt: daysFromNow(-50) }), // outside 44d
      pv('/events/4', 'p'), // past event
    ];
    const traffic = computeEventTraffic(rows, NOW - TRAFFIC_DAYS * DAY, NOW);
    const sb = buildEventScoreboard(
      [ev(1, 1), ev(2, 2), ev(3, 3), ev(4, -2)], traffic, new Map(), NOW, rows,
    );
    const summed = sb.upcoming.reduce((n, r) => n + r.viewers, 0);
    expect(summed).toBe(4); // a counted 3x + b
    expect(sb.upcomingViewers).toBe(2);
    expect(sb.pastViewers).toBe(1);
  });

  it('distinct total counts keyless rows one each and is 0 for an empty list', () => {
    const rows = [pv('/events/1', null), pv('/events/1', null), pv('/events/1', null, { visitId: 'v' }), pv('/events/1', null, { visitId: 'v' })];
    expect(countDistinctEventViewers(rows, new Set([1]), NOW - TRAFFIC_DAYS * DAY, NOW)).toBe(3);
    expect(countDistinctEventViewers(rows, new Set(), NOW - TRAFFIC_DAYS * DAY, NOW)).toBe(0);
  });
});

describe('fetchScoreboardEvents visibility filter', () => {
  // Captures the WHERE clause the query builds so we can assert on the rendered SQL.
  function captureWhere() {
    let where: unknown;
    const chain = {
      from: () => chain,
      where: (w: unknown) => { where = w; return Promise.resolve([]); },
    };
    const db = { select: () => chain };
    return { db, rendered: () => new PgDialect().sqlToQuery(where as SQL) };
  }

  it('excludes only booking-created rows (source_event_type_id set), not by visibility', async () => {
    const { db, rendered } = captureWhere();
    await fetchScoreboardEvents(db, NOW);
    const { sql: text } = rendered();
    // Booking-shaped rows (private + source_event_type_id) are dropped...
    expect(text).toContain('"source_event_type_id" is null');
    expect(text).toContain('"cancelled_at" is null');
    // ...while visibility is not filtered, so public, members and private
    // member-created events (source_event_type_id null) all pass.
    expect(text).not.toContain('visibility');
  });
});
