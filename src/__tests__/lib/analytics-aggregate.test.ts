import { computeAnalyticsSummary, type AnalyticsRow } from '@/lib/analytics/aggregate';

// Fixed reference "now" so window slicing is deterministic.
const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

function pageview(createdAt: string, visitorId: string | null, isGuest = false, path = '/'): AnalyticsRow {
  return { type: 'pageview', path, target: null, visitorId, isGuest, createdAt };
}

describe('computeAnalyticsSummary', () => {
  it('counts pageviews, unique visitors, guests and clicks within each window', () => {
    const rows: AnalyticsRow[] = [
      pageview(hoursAgo(1), 'v1'),
      pageview(hoursAgo(2), 'v1'), // same visitor → still 1 unique in day window
      pageview(hoursAgo(3), 'v2', true), // guest pageview
      pageview(daysAgo(3), 'v3'), // outside day, inside week
      pageview(daysAgo(20), 'v4'), // outside week, inside month
      { type: 'guest_enter', path: '/guest', target: null, visitorId: null, isGuest: true, createdAt: hoursAgo(1) },
      { type: 'click', path: '/', target: 'join-meeting', visitorId: 'v1', isGuest: false, createdAt: hoursAgo(1) },
    ];

    // 7d window: 4 pageviews (h1,h2,h3,d3), 3 unique visitors (v1,v2,v3), 1 guest pv.
    const w7 = computeAnalyticsSummary(rows, NOW, { windowDays: 7 }).window;
    expect(w7.pageviews).toBe(4);
    expect(w7.uniqueVisitors).toBe(3);
    expect(w7.guestPageviews).toBe(1);
    expect(w7.guestEntries).toBe(1);
    expect(w7.clicks).toBe(1);

    // 30d window adds the 20-days-ago view → 5 pageviews, 4 unique.
    const w30 = computeAnalyticsSummary(rows, NOW, { windowDays: 30 }).window;
    expect(w30.pageviews).toBe(5);
    expect(w30.uniqueVisitors).toBe(4);
  });

  it('excludes events older than 30 days', () => {
    const rows: AnalyticsRow[] = [pageview(daysAgo(45), 'old')];
    const s = computeAnalyticsSummary(rows, NOW);
    expect(s.window.pageviews).toBe(0);
    expect(s.dailyPageviews.every((p) => p.views === 0)).toBe(true);
  });

  it('ranks top paths and top clicks by frequency', () => {
    const rows: AnalyticsRow[] = [
      pageview(hoursAgo(1), 'v1', false, '/week'),
      pageview(hoursAgo(2), 'v2', false, '/week'),
      pageview(hoursAgo(3), 'v3', false, '/about'),
      { type: 'click', path: '/', target: 'landing:sign-up', visitorId: 'v1', isGuest: false, createdAt: hoursAgo(1) },
      { type: 'click', path: '/', target: 'landing:sign-up', visitorId: 'v2', isGuest: false, createdAt: hoursAgo(1) },
      { type: 'click', path: '/', target: 'join-meeting', visitorId: 'v3', isGuest: false, createdAt: hoursAgo(1) },
    ];
    const s = computeAnalyticsSummary(rows, NOW);
    expect(s.topPaths[0]).toEqual({ path: '/week', views: 2 });
    expect(s.topClicks[0]).toEqual({ target: 'landing:sign-up', clicks: 2 });
  });

  it('buckets the default 30-day window by week, newest last', () => {
    const s = computeAnalyticsSummary([pageview(hoursAgo(1), 'v1', true)], NOW);
    expect(s.trendBucket).toBe('week');
    expect(s.dailyPageviews).toHaveLength(5); // 30d = 4 full weeks + a 2-day remainder
    const last = s.dailyPageviews[s.dailyPageviews.length - 1];
    expect(last.endDate).toBe('2026-07-17');
    expect(last.views).toBe(1);
    expect(last.guestViews).toBe(1);
  });
});

describe('computeAnalyticsSummary — selected window', () => {
  it('uses daily buckets at 7d, with zero days at exactly 0', () => {
    const s = computeAnalyticsSummary([pageview(hoursAgo(1), 'v1')], NOW, { windowDays: 7 });
    expect(s.trendBucket).toBe('day');
    expect(s.dailyPageviews).toHaveLength(7);
    expect(s.dailyPageviews.map((p) => p.views)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it('uses weekly buckets at 90d and keeps totals consistent with the tiles', () => {
    const rows = [pageview(daysAgo(1), 'v1'), pageview(daysAgo(40), 'v2'), pageview(daysAgo(85), 'v3')];
    const s = computeAnalyticsSummary(rows, NOW, { windowDays: 90 });
    expect(s.trendBucket).toBe('week');
    expect(s.dailyPageviews).toHaveLength(13);
    expect(s.dailyPageviews.reduce((a, p) => a + p.views, 0)).toBe(3);
    expect(s.window.pageviews).toBe(3);
  });

  it('drives tiles and ranked lists from the selected window', () => {
    const rows = [
      pageview(daysAgo(2), 'v1', false, '/new'),
      pageview(daysAgo(60), 'v2', false, '/old'),
    ];
    const w7 = computeAnalyticsSummary(rows, NOW, { windowDays: 7 });
    const w90 = computeAnalyticsSummary(rows, NOW, { windowDays: 90 });
    expect(w7.window.pageviews).toBe(1);
    expect(w7.topPaths.map((p) => p.path)).toEqual(['/new']);
    expect(w90.window.pageviews).toBe(2);
    expect(w90.topPaths).toHaveLength(2);
  });
});

describe('computeAnalyticsSummary — internal traffic exclusion', () => {
  it('drops /admin paths and the admin:self-test click from every count', () => {
    const rows: AnalyticsRow[] = [
      pageview(hoursAgo(1), 'real', false, '/events/12'),
      { ...pageview(hoursAgo(1), 'admin', false, '/admin'), visitId: 'adm', referrerHost: 'x.com' },
      pageview(hoursAgo(1), 'admin', false, '/admin/analytics'),
      { type: 'click', path: '/admin', target: 'admin:self-test', visitorId: 'admin', isGuest: false, createdAt: hoursAgo(1) },
      { type: 'click', path: '/', target: 'admin:self-test', visitorId: 'admin', isGuest: false, createdAt: hoursAgo(1) },
      { type: 'click', path: '/', target: 'join-meeting', visitorId: 'real', isGuest: false, createdAt: hoursAgo(1) },
      { type: 'guest_enter', path: '/admin', target: null, visitorId: null, isGuest: true, createdAt: hoursAgo(1) },
    ];
    const s = computeAnalyticsSummary(rows, NOW);
    expect(s.window.pageviews).toBe(1);
    expect(s.window.uniqueVisitors).toBe(1);
    expect(s.window.clicks).toBe(1);
    expect(s.window.guestEntries).toBe(0);
    expect(s.topPaths).toEqual([{ path: '/events/12', views: 1 }]);
    expect(s.topClicks).toEqual([{ target: 'join-meeting', clicks: 1 }]);
    expect(s.topReferrers.some((r) => r.label === 'x.com')).toBe(false);
    expect(s.dailyPageviews.reduce((a, p) => a + p.views, 0)).toBe(1);
  });
});

describe('computeAnalyticsSummary — visit-shaped metrics', () => {
  const NOW = Date.parse('2026-08-08T12:00:00.000Z');
  const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

  function pv(over: Partial<AnalyticsRow> = {}): AnalyticsRow {
    return {
      type: 'pageview',
      path: '/',
      target: null,
      visitorId: 'v1',
      isGuest: false,
      createdAt: ago(10),
      ...over,
    };
  }

  it('counts visits by visitId, not raw pageviews', () => {
    const rows = [
      pv({ visitId: 'a' }), pv({ visitId: 'a' }), pv({ visitId: 'a' }),
      pv({ visitId: 'b' }),
    ];
    const { window: w } = computeAnalyticsSummary(rows, NOW);
    expect(w.pageviews).toBe(4);
    expect(w.visits).toBe(2);
    expect(w.pagesPerVisit).toBe(2);
  });

  it('counts visits reaching an event page once each, only for /events/ paths', () => {
    const rows = [
      pv({ visitId: 'a', path: '/' }), pv({ visitId: 'a', path: '/events/3' }), pv({ visitId: 'a', path: '/events/4' }),
      pv({ visitId: 'b', path: '/events/3' }),
      pv({ visitId: 'c', path: '/week' }),
      pv({ visitId: 'd', path: '/eventsfoo' }),
    ];
    const { window: w } = computeAnalyticsSummary(rows, NOW);
    expect(w.visits).toBe(4);
    expect(w.visitsToEvents).toBe(2);
  });

  it('splits new from returning by first-ever appearance', () => {
    const rows = [
      // Seen three weeks ago and again today → returning.
      pv({ visitorId: 'old', visitId: 'x', createdAt: ago(60 * 24 * 21) }),
      pv({ visitorId: 'old', visitId: 'y' }),
      // First appearance is inside the day window → new.
      pv({ visitorId: 'fresh', visitId: 'z' }),
    ];
    const { window: w } = computeAnalyticsSummary(rows, NOW, { windowDays: 7 });
    expect(w.newVisitors).toBe(1);
    expect(w.returningVisitors).toBe(1);
  });

  it('uses full-history first-seen so a visitor first seen before the loaded window is returning', () => {
    const rows = [
      pv({ visitorId: 'old', visitId: 'y' }),
      pv({ visitorId: 'fresh', visitId: 'z' }),
    ];
    // Loaded rows alone would call both new; full history says 'old' was here 50 days ago.
    const firstSeen = new Map([
      ['old', NOW - 50 * 24 * 60 * 60_000],
      ['fresh', NOW - 10 * 60_000],
    ]);
    const { window } = computeAnalyticsSummary(rows, NOW, { firstSeen });
    expect(window.newVisitors).toBe(1);
    expect(window.returningVisitors).toBe(1);
  });

  it('treats a visitor missing from first-seen as returning, not new', () => {
    const { window } = computeAnalyticsSummary([pv({ visitorId: 'ghost', visitId: 'g' })], NOW, {
      firstSeen: new Map(),
    });
    expect(window.newVisitors).toBe(0);
    expect(window.returningVisitors).toBe(1);
  });

  it('reports zeroed visit metrics rather than dividing by zero', () => {
    const { window: w } = computeAnalyticsSummary([], NOW);
    expect(w.visits).toBe(0);
    expect(w.pagesPerVisit).toBe(0);
    expect(w.visitsToEvents).toBe(0);
  });
});

describe('computeAnalyticsSummary — breakdowns', () => {
  const NOW = Date.parse('2026-08-08T12:00:00.000Z');
  const recent = new Date(NOW - 60_000).toISOString();

  function row(over: Partial<AnalyticsRow>): AnalyticsRow {
    return {
      type: 'pageview', path: '/', target: null, visitorId: 'v',
      isGuest: false, createdAt: recent, ...over,
    };
  }

  it('ranks referrers, countries, devices and viewers', () => {
    const rows = [
      row({ referrerHost: 'google.com', country: 'GB', device: 'mobile', viewer: 'anonymous' }),
      row({ referrerHost: 'google.com', country: 'GB', device: 'mobile', viewer: 'member' }),
      row({ referrerHost: '(direct)', country: 'BR', device: 'desktop', viewer: 'guest' }),
    ];
    const s = computeAnalyticsSummary(rows, NOW);
    expect(s.topReferrers[0]).toEqual({ label: 'google.com', count: 2 });
    expect(s.topCountries[0]).toEqual({ label: 'GB', count: 2 });
    expect(s.devices[0]).toEqual({ label: 'mobile', count: 2 });
    expect(s.viewers.map((v) => v.label).sort()).toEqual(['anonymous', 'guest', 'member']);
  });

  it('folds pre-enrichment nulls into (unknown) instead of dropping them', () => {
    // Rows recorded before these columns existed must not silently shrink totals.
    const rows = [row({ referrerHost: null, country: null }), row({ referrerHost: 'x.com', country: 'US' })];
    const s = computeAnalyticsSummary(rows, NOW);
    const total = s.topReferrers.reduce((a, r) => a + r.count, 0);
    expect(total).toBe(2);
    expect(s.topReferrers.some((r) => r.label === '(unknown)')).toBe(true);
  });

  it('counts only pageviews, not clicks', () => {
    const rows = [
      row({ referrerHost: 'a.com' }),
      row({ type: 'click', target: 'cta', referrerHost: 'a.com' }),
    ];
    expect(computeAnalyticsSummary(rows, NOW).topReferrers[0].count).toBe(1);
  });
});
