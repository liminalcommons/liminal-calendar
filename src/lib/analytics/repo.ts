/**
 * DB access for the analytics dashboard. Kept separate from the pure
 * aggregation (aggregate.ts) so the number-crunching stays unit-testable.
 */

import { and, count, countDistinct, desc, eq, gte } from 'drizzle-orm';
import { analyticsEvents } from '@/lib/db/schema';
import type { AnalyticsRow } from './aggregate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Load the trailing-30-day window used to build the dashboard summary.
 * Bounded by a hard row cap so a traffic spike can't blow up the query — if
 * the cap is hit the newest rows win (order by created_at desc).
 */
export async function fetchRecentAnalyticsRows(
  db: Db,
  nowMs: number,
  limit = 50000,
): Promise<AnalyticsRow[]> {
  const since = new Date(nowMs - 30 * DAY_MS);
  const rows = await db
    .select({
      type: analyticsEvents.type,
      path: analyticsEvents.path,
      target: analyticsEvents.target,
      visitorId: analyticsEvents.visitorId,
      isGuest: analyticsEvents.isGuest,
      createdAt: analyticsEvents.createdAt,
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
  }));
}

/**
 * True when the error is Postgres 42P01 (undefined_table) — i.e. the
 * analytics_events table doesn't exist because migrations never created it.
 * Distinguishing this from a generic DB error is what lets the admin panel
 * say "run migrations" instead of "something went wrong".
 */
export function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === '42P01';
}

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
  uniqueVisitors: number;
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

  const [uv] = await db
    .select({ n: countDistinct(analyticsEvents.visitorId) })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.type, 'pageview')));

  return {
    pageviews: totalFor('pageview'),
    uniqueVisitors: Number(uv?.n ?? 0),
    guestEntries: totalFor('guest_enter'),
    clicks: totalFor('click'),
  };
}
