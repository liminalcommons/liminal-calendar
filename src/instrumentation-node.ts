/**
 * Node-only side of the instrumentation hook. Loaded from instrumentation.ts
 * inside a `NEXT_RUNTIME === 'nodejs'` branch so its `postgres` (tls/net/crypto)
 * imports never reach the Edge bundle.
 *
 * Auto-runs database migrations on every cold start. migrate.ts is fully
 * idempotent (every CREATE / ALTER uses IF NOT EXISTS or DO-block guards),
 * so re-running on every cold start is free.
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
import { runMigrations } from '@/lib/db/migrate';

if (process.env.SKIP_BOOT_MIGRATE !== 'true') {
  runMigrations()
    .then((result) => {
      console.warn('[boot-migrate]', JSON.stringify(result));
      // Individual statements can fail without failing the run (see migrate.ts).
      // Log each one at error level so a partially-applied schema is greppable
      // in the platform logs rather than buried inside one JSON blob.
      for (const f of result.failures) {
        console.error('[boot-migrate] statement failed:', f.statement, '→', f.error);
      }
    })
    .catch((err) => {
      console.error(
        '[boot-migrate] failed:',
        err instanceof Error ? err.message : String(err),
      );
    });
}
