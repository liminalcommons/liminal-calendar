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
  // Enrichment — null on rows recorded before these were collected, so every
  // consumer below treats null as "unknown" rather than dropping the row.
  referrerHost?: string | null;
  device?: string | null;
  country?: string | null;
  visitId?: string | null;
  viewer?: string | null;
}

export interface WindowStats {
  pageviews: number;
  uniqueVisitors: number;
  guestEntries: number;
  clicks: number;
  /** Pageviews where the guest cookie was present. */
  guestPageviews: number;
  /** Distinct visits (per-tab sessions), not raw hits. */
  visits: number;
  /** Pageviews per visit, one decimal. 0 when there are no visits. */
  pagesPerVisit: number;
  /** Percent of visits that viewed exactly one page. */
  bounceRate: number;
  /** Visitors whose first-ever event falls inside this window. */
  newVisitors: number;
  returningVisitors: number;
}

/** A counted breakdown row, e.g. one referrer or one country. */
export interface Breakdown {
  label: string;
  count: number;
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
  /** Where visitors arrived from, over the 30-day window. */
  topReferrers: Breakdown[];
  /** Country split (ISO alpha-2), over the 30-day window. */
  topCountries: Breakdown[];
  /** mobile / tablet / desktop split, over the 30-day window. */
  devices: Breakdown[];
  /** member / guest / anonymous split, over the 30-day window. */
  viewers: Breakdown[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyWindow(): WindowStats {
  return {
    pageviews: 0, uniqueVisitors: 0, guestEntries: 0, clicks: 0, guestPageviews: 0,
    visits: 0, pagesPerVisit: 0, bounceRate: 0, newVisitors: 0, returningVisitors: 0,
  };
}

function statsForWindow(
  rows: AnalyticsRow[],
  sinceMs: number,
  nowMs: number,
  /** Earliest event time per visitor across ALL loaded rows, for new/returning. */
  firstSeen: Map<string, number>,
): WindowStats {
  const stats = emptyWindow();
  const visitors = new Set<string>();
  // visitId -> pageview count, so a visit that viewed one page is a bounce.
  const visitPageviews = new Map<string, number>();

  for (const r of rows) {
    const t = Date.parse(r.createdAt);
    if (isNaN(t) || t < sinceMs || t > nowMs) continue;
    if (r.type === 'pageview') {
      stats.pageviews += 1;
      if (r.isGuest) stats.guestPageviews += 1;
      if (r.visitorId) visitors.add(r.visitorId);
      if (r.visitId) visitPageviews.set(r.visitId, (visitPageviews.get(r.visitId) ?? 0) + 1);
    } else if (r.type === 'guest_enter') {
      stats.guestEntries += 1;
    } else if (r.type === 'click') {
      stats.clicks += 1;
    }
  }

  stats.uniqueVisitors = visitors.size;
  stats.visits = visitPageviews.size;

  if (stats.visits > 0) {
    const viewsInVisits = Array.from(visitPageviews.values()).reduce((a, b) => a + b, 0);
    stats.pagesPerVisit = Math.round((viewsInVisits / stats.visits) * 10) / 10;
    const bounced = Array.from(visitPageviews.values()).filter((n) => n === 1).length;
    stats.bounceRate = Math.round((bounced / stats.visits) * 100);
  }

  // "New" means this window contains the visitor's first-ever recorded event.
  // Computed against the whole loaded row set, so someone who first appeared
  // last week counts as returning today rather than new again.
  for (const id of visitors) {
    const first = firstSeen.get(id);
    if (first !== undefined && first >= sinceMs) stats.newVisitors += 1;
    else stats.returningVisitors += 1;
  }

  return stats;
}

/** Earliest event timestamp per visitor across every row we loaded. */
function firstSeenByVisitor(rows: AnalyticsRow[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const r of rows) {
    if (!r.visitorId) continue;
    const t = Date.parse(r.createdAt);
    if (isNaN(t)) continue;
    const prev = first.get(r.visitorId);
    if (prev === undefined || t < prev) first.set(r.visitorId, t);
  }
  return first;
}

/**
 * Count a field across pageviews in the window, newest-first, capped.
 * Nulls fold into `unknownLabel` so pre-enrichment rows stay visible as
 * "unknown" instead of quietly shrinking the totals.
 */
function breakdown(
  rows: AnalyticsRow[],
  sinceMs: number,
  nowMs: number,
  pick: (r: AnalyticsRow) => string | null | undefined,
  unknownLabel: string,
  limit = 10,
): Breakdown[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.type !== 'pageview') continue;
    const t = Date.parse(r.createdAt);
    if (isNaN(t) || t < sinceMs || t > nowMs) continue;
    const raw = pick(r);
    const label = raw && raw.length > 0 ? raw : unknownLabel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
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

  const firstSeen = firstSeenByVisitor(rows);

  return {
    windows: {
      day: statsForWindow(rows, dayAgo, nowMs, firstSeen),
      week: statsForWindow(rows, weekAgo, nowMs, firstSeen),
      month: statsForWindow(rows, monthAgo, nowMs, firstSeen),
    },
    topPaths,
    topClicks,
    dailyPageviews: Array.from(daily.values()),
    topReferrers: breakdown(rows, monthAgo, nowMs, (r) => r.referrerHost, '(unknown)'),
    topCountries: breakdown(rows, monthAgo, nowMs, (r) => r.country, '(unknown)'),
    devices: breakdown(rows, monthAgo, nowMs, (r) => r.device, '(unknown)', 4),
    viewers: breakdown(rows, monthAgo, nowMs, (r) => r.viewer, '(unknown)', 4),
  };
}
