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

    const s = computeAnalyticsSummary(rows, NOW);

    // Day window: 3 pageviews (h1,h2,h3), 2 unique visitors (v1,v2), 1 guest pv.
    expect(s.windows.day.pageviews).toBe(3);
    expect(s.windows.day.uniqueVisitors).toBe(2);
    expect(s.windows.day.guestPageviews).toBe(1);
    expect(s.windows.day.guestEntries).toBe(1);
    expect(s.windows.day.clicks).toBe(1);

    // Week window adds the 3-days-ago view → 4 pageviews, 3 unique.
    expect(s.windows.week.pageviews).toBe(4);
    expect(s.windows.week.uniqueVisitors).toBe(3);

    // Month window adds the 20-days-ago view → 5 pageviews.
    expect(s.windows.month.pageviews).toBe(5);
    expect(s.windows.month.uniqueVisitors).toBe(4);
  });

  it('excludes events older than 30 days', () => {
    const rows: AnalyticsRow[] = [pageview(daysAgo(45), 'old')];
    const s = computeAnalyticsSummary(rows, NOW);
    expect(s.windows.month.pageviews).toBe(0);
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

  it('produces 30 daily buckets, newest last', () => {
    const s = computeAnalyticsSummary([pageview(hoursAgo(1), 'v1', true)], NOW);
    expect(s.dailyPageviews).toHaveLength(30);
    const last = s.dailyPageviews[s.dailyPageviews.length - 1];
    expect(last.date).toBe('2026-07-17');
    expect(last.views).toBe(1);
    expect(last.guestViews).toBe(1);
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
    const { windows } = computeAnalyticsSummary(rows, NOW);
    expect(windows.day.pageviews).toBe(4);
    expect(windows.day.visits).toBe(2);
    expect(windows.day.pagesPerVisit).toBe(2);
  });

  it('treats single-page visits as bounces', () => {
    const rows = [
      pv({ visitId: 'a' }), pv({ visitId: 'a' }), // engaged
      pv({ visitId: 'b' }),                        // bounce
      pv({ visitId: 'c' }),                        // bounce
    ];
    const { windows } = computeAnalyticsSummary(rows, NOW);
    expect(windows.day.bounceRate).toBe(67); // 2 of 3
  });

  it('splits new from returning by first-ever appearance', () => {
    const rows = [
      // Seen three weeks ago and again today → returning.
      pv({ visitorId: 'old', visitId: 'x', createdAt: ago(60 * 24 * 21) }),
      pv({ visitorId: 'old', visitId: 'y' }),
      // First appearance is inside the day window → new.
      pv({ visitorId: 'fresh', visitId: 'z' }),
    ];
    const { windows } = computeAnalyticsSummary(rows, NOW);
    expect(windows.day.newVisitors).toBe(1);
    expect(windows.day.returningVisitors).toBe(1);
  });

  it('reports zeroed visit metrics rather than dividing by zero', () => {
    const { windows } = computeAnalyticsSummary([], NOW);
    expect(windows.day.visits).toBe(0);
    expect(windows.day.pagesPerVisit).toBe(0);
    expect(windows.day.bounceRate).toBe(0);
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
