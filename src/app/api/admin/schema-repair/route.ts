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
import { desc, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { migrationRuns } from '@/lib/db/schema';
import { runMigrations } from '@/lib/db/migrate';
import {
  describeDatabaseTarget,
  resolveAppDatabaseUrl,
  resolveMigrationDatabaseUrl,
  retiredUrlVarsPresent,
} from '@/lib/db/url';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Every table the app declares, derived from the Drizzle schema rather than
 * hand-listed.
 *
 * A hardcoded list is what made the first version of this endpoint report a
 * false all-clear: it checked four tables, so "repaired" only ever meant
 * "those four exist". The root cause here sends ALL post-move DDL to the
 * wrong database, so any table added since could be missing — deriving the
 * list means a newly declared table is covered the day it's added, with no
 * second place to remember to update.
 */
function expectedTables(): string[] {
  return Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map((table) => getTableName(table as PgTable))
    .sort();
}

async function requireAdmin() {
  const user = await getAuthedUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

/**
 * Presence of every expected table. Reads pg_class once and compares in
 * memory rather than probing each name, so adding tables doesn't add round
 * trips. Runs through the app's `db` connection deliberately — the question
 * is what the APP can see, which is what diverged from what migrations wrote.
 */
async function tablePresence(): Promise<Record<string, boolean>> {
  const rows = (await db.execute(sql`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `)) as unknown as Array<{ name: string }>;

  const live = new Set((rows ?? []).map((r) => r.name));
  return Object.fromEntries(expectedTables().map((name) => [name, live.has(name)]));
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
      // Retired Neon integration vars. Present means Vercel is still injecting
      // them, which means the integration is still installed and billing.
      retiredVarsPresent: retiredUrlVarsPresent(),
      ...(migration.ignoredNonPooling ? { warning: migration.ignoredNonPooling.reason } : {}),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Recent migration runs. Best-effort: the ledger is itself created by a
 * migration, so a database that has never successfully migrated won't have
 * it — that's a valid answer (empty history), not an error.
 */
async function recentRuns() {
  try {
    const rows = await db
      .select({
        startedAt: migrationRuns.startedAt,
        finishedAt: migrationRuns.finishedAt,
        target: migrationRuns.target,
        targetSource: migrationRuns.targetSource,
        triggeredBy: migrationRuns.triggeredBy,
        failureCount: migrationRuns.failureCount,
        warning: migrationRuns.warning,
      })
      .from(migrationRuns)
      .orderBy(desc(migrationRuns.startedAt))
      .limit(10);
    return rows;
  } catch {
    return [];
  }
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  try {
    return NextResponse.json({
      tables: await tablePresence(),
      database: databaseTargets(),
      history: await recentRuns(),
    });
  } catch (err) {
    console.error('[GET /api/admin/schema-repair]', err);
    return NextResponse.json({ error: 'Failed to inspect schema' }, { status: 500 });
  }
}

export async function POST() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  try {
    const result = await runMigrations('admin');
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
      history: await recentRuns(),
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
