/**
 * Shared database error classification.
 *
 * Kept separate from any one feature's repo because the same question —
 * "did this fail because the table was never created?" — is asked by every
 * panel whose table sits behind a migration statement that can fail.
 */

/**
 * True when the error is Postgres 42P01 (undefined_table) — i.e. the table
 * doesn't exist because migrations never created it. Distinguishing this from
 * a generic DB error is what lets the admin panel say "repair the schema"
 * instead of "something went wrong".
 *
 * The cause chain matters: drizzle-orm (>=0.44) wraps every driver error in a
 * DrizzleQueryError that carries the original postgres error on `.cause` and
 * does NOT re-expose `code` on itself. Checking only the top-level `code`
 * silently never matches, which is how a missing table surfaced to the admin
 * as an opaque 500. Walk the chain (bounded, so a self-referential `cause`
 * can't spin) and also accept the message text as a last resort, since the
 * wrapper's own message embeds the failed query.
 */
export function isMissingTableError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (e.code === '42P01') return true;
    if (typeof e.message === 'string' && /relation ".+" does not exist/.test(e.message)) {
      return true;
    }
    current = e.cause;
  }
  return false;
}
