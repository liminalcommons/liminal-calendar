import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import {
  computeAnalyticsSummary,
  DEFAULT_WINDOW_DAYS,
  WINDOW_DAYS,
  type WindowDays,
} from '@/lib/analytics/aggregate';
import {
  fetchAllTimeTotals,
  fetchFirstSeenByVisitor,
  fetchLastEventAt,
  fetchRecentAnalyticsRows,
  isMissingTableError,
} from '@/lib/analytics/repo';

async function requireAdmin() {
  const user = await getAuthedUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role !== 'admin' && user.role !== 'governor') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

/** Zeroed payload so the panel can still render structure around a health note. */
function emptySummary(windowDays: WindowDays) {
  const day = {
    pageviews: 0, uniqueVisitors: 0, guestEntries: 0, clicks: 0, guestPageviews: 0,
    visits: 0, pagesPerVisit: 0, visitsToEvents: 0, newVisitors: 0, returningVisitors: 0,
  };
  return {
    windowDays,
    window: { ...day },
    trendBucket: 'day' as const,
    topPaths: [],
    topClicks: [],
    dailyPageviews: [],
  };
}

/** `?window=7|30|90`; anything else falls back to 30. */
function parseWindow(request: Request): WindowDays {
  const raw = Number(new URL(request.url).searchParams.get('window'));
  return (WINDOW_DAYS as readonly number[]).includes(raw) ? (raw as WindowDays) : DEFAULT_WINDOW_DAYS;
}

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const nowMs = Date.now();
  const windowDays = parseWindow(request);

  try {
    const rows = await fetchRecentAnalyticsRows(db, nowMs, undefined, windowDays);
    const firstSeen = await fetchFirstSeenByVisitor(db);
    const summary = computeAnalyticsSummary(rows, nowMs, { windowDays, firstSeen });
    const rawTotals = await fetchAllTimeTotals(db);
    const lastEventAt = await fetchLastEventAt(db);

    return NextResponse.json({
      generatedAt: new Date(nowMs).toISOString(),
      // `health` lets the dashboard tell "nobody has visited yet" apart from
      // "the pipeline is broken". Without it an empty table and a missing
      // table render identically, which is exactly how this went unnoticed.
      health: {
        status: 'ok' as const,
        tableExists: true,
        lastEventAt,
        // Raw, unfiltered, all-time count — deliberately NOT the window/admin-
        // filtered numbers. The pipeline self-test sends an `admin:self-test`
        // click (excluded from every displayed figure) and checks that this
        // total went up, so filtering or windowing it would break the test.
        totalEvents: rawTotals.pageviews + rawTotals.guestEntries + rawTotals.clicks,
      },
      ...summary,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      // Not a 500: this is a known, actionable state with a known fix, and
      // the panel renders it as guidance rather than a generic failure.
      console.error('[GET /api/admin/analytics] analytics_events table missing');
      return NextResponse.json({
        generatedAt: new Date(nowMs).toISOString(),
        health: {
          status: 'table_missing' as const,
          tableExists: false,
          lastEventAt: null,
          totalEvents: 0,
        },
        ...emptySummary(windowDays),
      });
    }

    console.error('[GET /api/admin/analytics]', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
