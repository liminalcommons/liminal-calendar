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
