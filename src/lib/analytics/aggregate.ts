/**
 * Pure analytics aggregation — no DB, no clock. The route fetches recent rows
 * and passes them here with an explicit `nowMs`, so this whole module is
 * deterministic and unit-testable.
 *
 * "Recent" means the trailing 30-day window the route loads; the day/week/month
 * summaries and the top-N lists are all derived from that same row set. All-time
 * totals are computed separately by the route via cheap COUNT queries (loading
 * every row of an unbounded table would not scale) and merged in afterward.
 */

export interface AnalyticsRow {
  type: string; // 'pageview' | 'guest_enter' | 'click'
  path: string | null;
  target: string | null;
  visitorId: string | null;
  isGuest: boolean;
  createdAt: string; // ISO 8601
}

export interface WindowStats {
  pageviews: number;
  uniqueVisitors: number;
  guestEntries: number;
  clicks: number;
  /** Pageviews where the guest cookie was present. */
  guestPageviews: number;
}

export interface TopPath {
  path: string;
  views: number;
}

export interface TopClick {
  target: string;
  clicks: number;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  views: number;
  guestViews: number;
}

export interface AnalyticsSummary {
  windows: {
    day: WindowStats;
    week: WindowStats;
    month: WindowStats;
  };
  topPaths: TopPath[];
  topClicks: TopClick[];
  /** One point per day for the last 30 days, oldest first. */
  dailyPageviews: DailyPoint[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyWindow(): WindowStats {
  return { pageviews: 0, uniqueVisitors: 0, guestEntries: 0, clicks: 0, guestPageviews: 0 };
}

function statsForWindow(rows: AnalyticsRow[], sinceMs: number, nowMs: number): WindowStats {
  const stats = emptyWindow();
  const visitors = new Set<string>();
  for (const r of rows) {
    const t = Date.parse(r.createdAt);
    if (isNaN(t) || t < sinceMs || t > nowMs) continue;
    if (r.type === 'pageview') {
      stats.pageviews += 1;
      if (r.isGuest) stats.guestPageviews += 1;
      if (r.visitorId) visitors.add(r.visitorId);
    } else if (r.type === 'guest_enter') {
      stats.guestEntries += 1;
    } else if (r.type === 'click') {
      stats.clicks += 1;
    }
  }
  stats.uniqueVisitors = visitors.size;
  return stats;
}

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Aggregate recent rows into the admin dashboard summary. `nowMs` is the
 * reference "now" (epoch millis) used to slice the trailing windows.
 */
export function computeAnalyticsSummary(rows: AnalyticsRow[], nowMs: number): AnalyticsSummary {
  const monthAgo = nowMs - 30 * DAY_MS;
  const weekAgo = nowMs - 7 * DAY_MS;
  const dayAgo = nowMs - DAY_MS;

  // Top paths / clicks over the 30-day window.
  const pathCounts = new Map<string, number>();
  const clickCounts = new Map<string, number>();
  // Daily buckets, keyed by UTC date, seeded with the last 30 calendar days
  // so gaps render as zeroes rather than vanishing from the trend.
  const daily = new Map<string, DailyPoint>();
  for (let i = 29; i >= 0; i--) {
    const key = utcDateKey(nowMs - i * DAY_MS);
    daily.set(key, { date: key, views: 0, guestViews: 0 });
  }

  for (const r of rows) {
    const t = Date.parse(r.createdAt);
    if (isNaN(t) || t < monthAgo || t > nowMs) continue;
    if (r.type === 'pageview') {
      const p = r.path && r.path.length > 0 ? r.path : '(unknown)';
      pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1);
      const key = utcDateKey(t);
      const point = daily.get(key);
      if (point) {
        point.views += 1;
        if (r.isGuest) point.guestViews += 1;
      }
    } else if (r.type === 'click') {
      const target = r.target && r.target.length > 0 ? r.target : '(unlabeled)';
      clickCounts.set(target, (clickCounts.get(target) ?? 0) + 1);
    }
  }

  const topPaths: TopPath[] = Array.from(pathCounts.entries())
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views || a.path.localeCompare(b.path))
    .slice(0, 10);

  const topClicks: TopClick[] = Array.from(clickCounts.entries())
    .map(([target, clicks]) => ({ target, clicks }))
    .sort((a, b) => b.clicks - a.clicks || a.target.localeCompare(b.target))
    .slice(0, 10);

  return {
    windows: {
      day: statsForWindow(rows, dayAgo, nowMs),
      week: statsForWindow(rows, weekAgo, nowMs),
      month: statsForWindow(rows, monthAgo, nowMs),
    },
    topPaths,
    topClicks,
    dailyPageviews: Array.from(daily.values()),
  };
}
