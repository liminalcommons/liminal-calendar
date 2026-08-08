/**
 * Single source of truth for which Postgres the app talks to.
 *
 * This exists because migrations and the app once resolved their connection
 * strings independently. migrate.ts preferred POSTGRES_URL_NON_POOLING — a
 * variable db/index.ts never checked — so on a deploy where that variable was
 * left over from a previous provider (the Vercel/Supabase Postgres
 * integrations inject it automatically), migrations created tables in the old
 * database while the app read from the new one. Every migration reported
 * success and every new table was invisible to the app. That is exactly how
 * analytics_events went missing: it was added after the database moved, so it
 * only ever got created in the database nothing reads from.
 *
 * The rule now: the app's URL is canonical. A non-pooling URL is only used for
 * DDL when it points at the *same* database, which is the case it exists for
 * (direct session instead of pgbouncer, same data).
 */

/**
 * Env vars the application reads, in precedence order.
 *
 * `calender_DATABASE_URL` / `calender_POSTGRES_URL` used to sit at the end of
 * this list. Those are the retired Neon integration's variables (see the
 * removed db-restore-from-neon route, which named them as the Neon side of the
 * migration). Vercel still injects them into every environment while the
 * integration is installed, so any deployment where DATABASE_URL wasn't
 * set — preview builds in particular — silently fell through to Neon and ran
 * the full boot migration against it on every cold start. Neon bills compute
 * and auto-suspends when idle, so that traffic kept a database nobody reads
 * awake and billing.
 *
 * They are deliberately NOT fallbacks any more: a deployment with no database
 * configured should fail loudly, not quietly write to a paid one.
 */
const APP_URL_VARS = ['DATABASE_URL', 'POSTGRES_URL'] as const;

/** Retired connection strings — reported if present, never connected to. */
const RETIRED_URL_VARS = ['calender_DATABASE_URL', 'calender_POSTGRES_URL'] as const;

/** Retired vars still present in the environment, for diagnostics. */
export function retiredUrlVarsPresent(): string[] {
  return RETIRED_URL_VARS.filter((k) => Boolean(process.env[k]));
}

/** Direct-session URL, preferred for DDL when it agrees with the app's URL. */
const NON_POOLING_VAR = 'POSTGRES_URL_NON_POOLING';

export interface ResolvedUrl {
  url: string;
  /** Which env var supplied it — surfaced in diagnostics, never the value. */
  source: string;
}

export interface MigrationTarget extends ResolvedUrl {
  /**
   * Set when the non-pooling URL was rejected because it names a different
   * database than the app's. Surfaced so a stale integration variable is
   * visible instead of silently splitting reads from writes.
   */
  ignoredNonPooling?: { source: string; target: string; reason: string };
}

export function resolveAppDatabaseUrl(): ResolvedUrl {
  for (const key of APP_URL_VARS) {
    const url = process.env[key];
    if (url) return { url, source: key };
  }
  const retired = retiredUrlVarsPresent();
  throw new Error(
    `No Postgres URL found (checked ${APP_URL_VARS.join(', ')})` +
      (retired.length
        ? `. ${retired.join(', ')} is set but belongs to the retired Neon ` +
          `integration and is deliberately not used — set DATABASE_URL for ` +
          `this environment, and uninstall the Neon integration.`
        : ''),
  );
}

/**
 * `host:port/database` — identity only, never credentials or query params.
 * Safe to log and to return from an admin diagnostics endpoint.
 */
export function describeDatabaseTarget(url: string): string {
  try {
    const u = new URL(url);
    const port = u.port || '5432';
    const database = u.pathname.replace(/^\//, '') || '(default)';
    return `${u.hostname}:${port}/${database}`;
  } catch {
    return '(unparseable connection string)';
  }
}

/** True when both URLs name the same host, port and database. */
export function sameDatabase(a: string, b: string): boolean {
  const da = describeDatabaseTarget(a);
  const db = describeDatabaseTarget(b);
  if (da.startsWith('(') || db.startsWith('(')) return false;
  return da === db;
}

/**
 * Connection string for DDL. Prefers the direct (non-pooling) session so DDL
 * doesn't run through pgbouncer, but only when it targets the same database
 * the app reads — otherwise migrations would apply somewhere nothing reads.
 */
export function resolveMigrationDatabaseUrl(): MigrationTarget {
  const app = resolveAppDatabaseUrl();
  const nonPooling = process.env[NON_POOLING_VAR];

  if (!nonPooling) return app;

  if (sameDatabase(nonPooling, app.url)) {
    return { url: nonPooling, source: NON_POOLING_VAR };
  }

  return {
    ...app,
    ignoredNonPooling: {
      source: NON_POOLING_VAR,
      target: describeDatabaseTarget(nonPooling),
      reason:
        `${NON_POOLING_VAR} points at a different database than ${app.source} ` +
        `(${describeDatabaseTarget(app.url)}). Ignoring it so migrations apply ` +
        `to the database the app actually reads. Remove the stale variable.`,
    },
  };
}
