/**
 * Admin: re-run migrations on demand and report exactly what failed.
 *
 * Migrations already run on every cold start, but two things made a broken
 * schema hard to act on: the run happened where only platform logs could see
 * it, and a statement failing mid-chain used to abort everything after it
 * (see lib/db/migrate.ts). An admin hitting this endpoint gets the same
 * idempotent run plus the per-statement failure list, so a missing table can
 * be diagnosed and fixed from the admin page instead of needing a
 * CRON_SECRET curl or a redeploy.
 *
 * GET  — read-only: which expected tables exist right now
 * POST — run migrations, then report table presence + failures
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { runMigrations } from '@/lib/db/migrate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tables the admin panels depend on. newsletter_subscribers and
// analytics_events are the two that sit behind failable UNIQUE statements in
// the migration chain, so they are the ones that actually go missing.
const EXPECTED_TABLES = [
  'members',
  'events',
  'newsletter_subscribers',
  'analytics_events',
] as const;

async function requireAdmin() {
  const user = await getAuthedUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

/**
 * Presence of each expected table, via to_regclass — returns NULL rather than
 * throwing for a missing relation, so one query answers for all of them.
 */
async function tablePresence(): Promise<Record<string, boolean>> {
  const present: Record<string, boolean> = {};
  for (const name of EXPECTED_TABLES) {
    try {
      const rows = (await db.execute(
        sql`SELECT to_regclass(${'public.' + name}) IS NOT NULL AS present`,
      )) as unknown as Array<{ present: boolean }>;
      present[name] = Boolean(rows?.[0]?.present);
    } catch {
      present[name] = false;
    }
  }
  return present;
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  try {
    return NextResponse.json({ tables: await tablePresence() });
  } catch (err) {
    console.error('[GET /api/admin/schema-repair]', err);
    return NextResponse.json({ error: 'Failed to inspect schema' }, { status: 500 });
  }
}

export async function POST() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  try {
    const result = await runMigrations();
    const tables = await tablePresence();
    const missing = Object.entries(tables)
      .filter(([, present]) => !present)
      .map(([name]) => name);

    return NextResponse.json({
      // `success` is migrate's "every statement applied". Tables can all be
      // present even when some statements failed (e.g. a UNIQUE constraint
      // that collides with existing duplicate rows), which is a healthy
      // enough outcome for the panels — so report both, don't conflate them.
      success: result.success,
      message: result.message,
      failures: result.failures,
      tables,
      missing,
      repaired: missing.length === 0,
    });
  } catch (err) {
    console.error('[POST /api/admin/schema-repair]', err);
    return NextResponse.json(
      { error: 'Migration run failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
