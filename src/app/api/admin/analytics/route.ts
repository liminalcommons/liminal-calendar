import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { computeAnalyticsSummary } from '@/lib/analytics/aggregate';
import { fetchAllTimeTotals, fetchRecentAnalyticsRows } from '@/lib/analytics/repo';

async function requireAdmin() {
  const user = await getAuthedUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  try {
    const nowMs = Date.now();
    const rows = await fetchRecentAnalyticsRows(db, nowMs);
    const summary = computeAnalyticsSummary(rows, nowMs);
    const allTime = await fetchAllTimeTotals(db);

    return NextResponse.json({
      generatedAt: new Date(nowMs).toISOString(),
      allTime,
      ...summary,
    });
  } catch (err) {
    console.error('[GET /api/admin/analytics]', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
