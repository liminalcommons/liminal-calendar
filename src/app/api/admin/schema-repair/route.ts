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
import {
  describeDatabaseTarget,
  resolveAppDatabaseUrl,
  resolveMigrationDatabaseUrl,
} from '@/lib/db/url';

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

/**
 * Which database reads and writes each go to. Host/port/database only — never
 * credentials. `sameTarget: false` means migrations are being applied
 * somewhere the app doesn't read, which presents as "migration succeeded,
 * table still missing".
 */
function databaseTargets() {
  try {
    const app = resolveAppDatabaseUrl();
    const migration = resolveMigrationDatabaseUrl();
    return {
      app: describeDatabaseTarget(app.url),
      appSource: app.source,
      migration: describeDatabaseTarget(migration.url),
      migrationSource: migration.source,
      sameTarget: describeDatabaseTarget(app.url) === describeDatabaseTarget(migration.url),
      ...(migration.ignoredNonPooling ? { warning: migration.ignoredNonPooling.reason } : {}),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  try {
    return NextResponse.json({ tables: await tablePresence(), database: databaseTargets() });
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
      // Reported on every run: a migration that succeeds while tables stay
      // missing means DDL and reads went to different databases, and that is
      // otherwise indistinguishable from a silent no-op.
      database: databaseTargets(),
      ...(result.warning ? { warning: result.warning } : {}),
    });
  } catch (err) {
    console.error('[POST /api/admin/schema-repair]', err);
    return NextResponse.json(
      { error: 'Migration run failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
