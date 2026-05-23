/**
 * Next.js instrumentation hook — runs once per server cold start, before
 * any request is handled.
 *
 * We use it to auto-run database migrations on each fresh container. The
 * migrations in src/lib/db/migrate.ts are fully idempotent (every CREATE /
 * ALTER uses IF NOT EXISTS or DO-block guards), so re-running them on
 * every cold start is free.
 *
 * Why this exists: previously, schema changes required a manual
 *   curl -X POST .../api/db-migrate -H "Authorization: Bearer $CRON_SECRET"
 * after every deploy. Forgetting that step left production with a stale
 * schema, which manifested as a cascade of 401s when `db.select().from(members)`
 * referenced a column that hadn't been added yet. See
 * gotcha_calendar_bootstrap_schema_drift.md.
 *
 * Skip with SKIP_BOOT_MIGRATE=true (e.g. for local dev when iterating on a
 * dev DB, or for a deploy that must not touch the schema).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.SKIP_BOOT_MIGRATE === 'true') return;

  const { runMigrations } = await import('@/lib/db/migrate');
  try {
    const result = await runMigrations();
    console.warn('[boot-migrate]', JSON.stringify(result));
  } catch (err) {
    console.error(
      '[boot-migrate] failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
