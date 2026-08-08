import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { computeAnalyticsSummary } from '@/lib/analytics/aggregate';
import {
  fetchAllTimeTotals,
  fetchLastEventAt,
  fetchRecentAnalyticsRows,
  isMissingTableError,
} from '@/lib/analytics/repo';

async function requireAdmin() {
  const user = await getAuthedUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

/** Zeroed payload so the panel can still render structure around a health note. */
function emptySummary() {
  const day = { pageviews: 0, uniqueVisitors: 0, guestEntries: 0, clicks: 0, guestPageviews: 0 };
  return {
    allTime: { pageviews: 0, uniqueVisitors: 0, guestEntries: 0, clicks: 0 },
    windows: { day: { ...day }, week: { ...day }, month: { ...day } },
    topPaths: [],
    topClicks: [],
    dailyPageviews: [],
  };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const nowMs = Date.now();

  try {
    const rows = await fetchRecentAnalyticsRows(db, nowMs);
    const summary = computeAnalyticsSummary(rows, nowMs);
    const allTime = await fetchAllTimeTotals(db);
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
        totalEvents: allTime.pageviews + allTime.guestEntries + allTime.clicks,
      },
      allTime,
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
        ...emptySummary(),
      });
    }

    console.error('[GET /api/admin/analytics]', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
