/**
 * DB access for the analytics dashboard. Kept separate from the pure
 * aggregation (aggregate.ts) so the number-crunching stays unit-testable.
 */

import {
  and, count, desc, eq, gte, inArray, isNotNull, isNull, like, lte, min, ne, notLike, or, sql,
} from 'drizzle-orm';
import { analyticsEvents, events, members, rsvps } from '@/lib/db/schema';
import {
  INTERNAL_CLICK_TARGET, INTERNAL_PATH_PREFIX, PAST_DAYS, TRAFFIC_DAYS, UPCOMING_DAYS,
  type AnalyticsRow, type EventRsvpCounts, type FunnelDbCounts, type ScoreboardEvent,
} from './aggregate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const DAY_MS = 24 * 60 * 60 * 1000;

const ROW_COLUMNS = {
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
  ref: analyticsEvents.ref,
};

function toAnalyticsRow(r: Record<string, unknown>): AnalyticsRow {
  return {
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
    ref: (r.ref as string | null) ?? null,
  };
}

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
    .select(ROW_COLUMNS)
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(limit);

  return rows.map(toAnalyticsRow);
}

/**
 * Event-page pageviews over the FIXED scoreboard range (TRAFFIC_DAYS), fetched
 * independently of the 7/30/90 selector so an event's views never shrink with
 * it. Internal traffic (admin self-test target) is filtered in SQL; `/events/%`
 * already excludes `/admin…` paths, and parseEventId does the exact match
 * downstream. Same hard row cap / newest-wins as the main load.
 */
export async function fetchEventPageviewRows(db: Db, nowMs: number, limit = 50000): Promise<AnalyticsRow[]> {
  const since = new Date(nowMs - TRAFFIC_DAYS * DAY_MS);
  const rows = await db
    .select(ROW_COLUMNS)
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.type, 'pageview'),
        gte(analyticsEvents.createdAt, since),
        lte(analyticsEvents.createdAt, new Date(nowMs)),
        like(analyticsEvents.path, '/events/%'),
        or(isNull(analyticsEvents.target), ne(analyticsEvents.target, INTERNAL_CLICK_TARGET)),
      ),
    )
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(limit);

  return rows.map(toAnalyticsRow);
}

/**
 * The funnel steps that live outside analytics_events: guest RSVPs (rsvps with
 * no member_id, excluding declined `no` replies) and members created in the
 * window. Two indexed-ish COUNTs, no row load.
 */
export async function fetchFunnelDbCounts(
  db: Db,
  nowMs: number,
  windowDays: number,
): Promise<FunnelDbCounts> {
  const since = new Date(nowMs - windowDays * DAY_MS);
  const until = new Date(nowMs);
  const [rsvpRow] = await db
    .select({ c: count() })
    .from(rsvps)
    .where(and(isNull(rsvps.memberId), ne(rsvps.status, 'no'), gte(rsvps.createdAt, since), lte(rsvps.createdAt, until)));
  const [memberRow] = await db
    .select({ c: count() })
    .from(members)
    .where(and(gte(members.createdAt, since), lte(members.createdAt, until)));
  return { guestRsvps: Number(rsvpRow?.c ?? 0), newMembers: Number(memberRow?.c ?? 0) };
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

/**
 * Events eligible for the scoreboard (started in the last PAST_DAYS or start in
 * the next UPCOMING_DAYS; cancelled events and booking-created events — the
 * rows with source_event_type_id set, which are always private — skipped; public,
 * members and private member-created events all stay) plus their all-time RSVP
 * counts. The upcoming/past split itself happens in buildEventScoreboard.
 */
export async function fetchScoreboardEvents(
  db: Db,
  nowMs: number,
): Promise<{ events: ScoreboardEvent[]; rsvpCounts: Map<number, EventRsvpCounts> }> {
  const from = new Date(nowMs - PAST_DAYS * DAY_MS);
  const to = new Date(nowMs + UPCOMING_DAYS * DAY_MS);
  const eventRows: Array<{ id: number; title: string; startsAt: Date | string; timezone: string | null }> = await db
    .select({ id: events.id, title: events.title, startsAt: events.startsAt, timezone: events.timezone })
    .from(events)
    .where(and(gte(events.startsAt, from), lte(events.startsAt, to), isNull(events.cancelledAt), isNull(events.sourceEventTypeId)));

  const rsvpCounts = new Map<number, EventRsvpCounts>();
  if (eventRows.length > 0) {
    const rows: Array<{ eventId: number; yes: number | string; interested: number | string; guest: number | string }> = await db
      .select({
        eventId: rsvps.eventId,
        yes: sql<number>`count(*) filter (where ${rsvps.status} = 'yes')`,
        interested: sql<number>`count(*) filter (where ${rsvps.status} = 'interested')`,
        guest: sql<number>`count(*) filter (where ${rsvps.memberId} is null and ${rsvps.status} <> 'no')`,
      })
      .from(rsvps)
      .where(inArray(rsvps.eventId, eventRows.map((e) => e.id)))
      .groupBy(rsvps.eventId);
    for (const r of rows) {
      rsvpCounts.set(r.eventId, { yes: Number(r.yes), interested: Number(r.interested), guest: Number(r.guest) });
    }
  }

  return {
    events: eventRows.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt instanceof Date ? e.startsAt.toISOString() : String(e.startsAt),
      timezone: e.timezone ?? 'UTC',
    })),
    rsvpCounts,
  };
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
