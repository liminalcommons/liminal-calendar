/**
 * DB access for the analytics dashboard. Kept separate from the pure
 * aggregation (aggregate.ts) so the number-crunching stays unit-testable.
 */

import {
  and, count, desc, gte, isNotNull, isNull, min, ne, notLike, or,
} from 'drizzle-orm';
import { analyticsEvents } from '@/lib/db/schema';
import { INTERNAL_CLICK_TARGET, INTERNAL_PATH_PREFIX, type AnalyticsRow } from './aggregate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Load the trailing window used to build the dashboard summary (default 30
 * days; the route passes the selected window).
 * Bounded by a hard row cap so a traffic spike can't blow up the query — if
 * the cap is hit the newest rows win (order by created_at desc).
 */
export async function fetchRecentAnalyticsRows(
  db: Db,
  nowMs: number,
  limit = 50000,
  windowDays = 30,
): Promise<AnalyticsRow[]> {
  const since = new Date(nowMs - windowDays * DAY_MS);
  const rows = await db
    .select({
      type: analyticsEvents.type,
      path: analyticsEvents.path,
      target: analyticsEvents.target,
      visitorId: analyticsEvents.visitorId,
      isGuest: analyticsEvents.isGuest,
      createdAt: analyticsEvents.createdAt,
      referrerHost: analyticsEvents.referrerHost,
      device: analyticsEvents.device,
      country: analyticsEvents.country,
      visitId: analyticsEvents.visitId,
      viewer: analyticsEvents.viewer,
    })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(limit);

  return rows.map((r: Record<string, unknown>) => ({
    type: r.type as string,
    path: (r.path as string | null) ?? null,
    target: (r.target as string | null) ?? null,
    visitorId: (r.visitorId as string | null) ?? null,
    isGuest: Boolean(r.isGuest),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    referrerHost: (r.referrerHost as string | null) ?? null,
    device: (r.device as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    visitId: (r.visitId as string | null) ?? null,
    viewer: (r.viewer as string | null) ?? null,
  }));
}

/**
 * Earliest event time (epoch ms) per visitor across FULL history — the basis
 * for new vs returning. Internal (admin) rows are excluded so an admin poking
 * around first doesn't make a later real visit look like a return.
 */
export async function fetchFirstSeenByVisitor(db: Db): Promise<Map<string, number>> {
  const rows: Array<{ visitorId: string | null; first: Date | string | null }> = await db
    .select({ visitorId: analyticsEvents.visitorId, first: min(analyticsEvents.createdAt) })
    .from(analyticsEvents)
    .where(
      and(
        isNotNull(analyticsEvents.visitorId),
        or(isNull(analyticsEvents.path), notLike(analyticsEvents.path, `${INTERNAL_PATH_PREFIX}%`)),
        or(isNull(analyticsEvents.target), ne(analyticsEvents.target, INTERNAL_CLICK_TARGET)),
      ),
    )
    .groupBy(analyticsEvents.visitorId);

  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.visitorId || !r.first) continue;
    const t = new Date(r.first).getTime();
    if (!isNaN(t)) out.set(r.visitorId, t);
  }
  return out;
}

// Re-exported so existing analytics callers keep a single import site.
export { isMissingTableError } from '@/lib/db/errors';

/** Timestamp of the most recent row, or null when the table is empty. */
export async function fetchLastEventAt(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ createdAt: analyticsEvents.createdAt })
    .from(analyticsEvents)
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(1);
  if (!row?.createdAt) return null;
  return row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
}

export interface AllTimeTotals {
  pageviews: number;
  guestEntries: number;
  clicks: number;
}

/** Cheap all-time counters, computed with indexed COUNTs (no row load). */
export async function fetchAllTimeTotals(db: Db): Promise<AllTimeTotals> {
  const byType: Array<{ type: string; c: number }> = await db
    .select({ type: analyticsEvents.type, c: count() })
    .from(analyticsEvents)
    .groupBy(analyticsEvents.type);

  const totalFor = (t: string) => Number(byType.find((r) => r.type === t)?.c ?? 0);

  return {
    pageviews: totalFor('pageview'),
    guestEntries: totalFor('guest_enter'),
    clicks: totalFor('click'),
  };
}
