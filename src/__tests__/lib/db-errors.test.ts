import { isMissingTableError } from '../../lib/db/errors';

/**
 * Drizzle >=0.44 wraps driver errors in DrizzleQueryError, which carries the
 * original postgres error on `.cause` and does not re-expose `code`. A check
 * that only looked at the top-level `code` never matched, so a missing table
 * reached the admin as an opaque 500 instead of an actionable state.
 */
function drizzleWrapped(cause: unknown): Error {
  const err = new Error('Failed query: select ... from "analytics_events"\nparams: ');
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

function pgUndefinedTable(relation = 'analytics_events') {
  return Object.assign(new Error(`relation "${relation}" does not exist`), {
    code: '42P01',
    severity: 'ERROR',
  });
}

describe('isMissingTableError', () => {
  it('matches a bare postgres 42P01', () => {
    expect(isMissingTableError(pgUndefinedTable())).toBe(true);
  });

  it('matches a 42P01 wrapped by DrizzleQueryError (the real production shape)', () => {
    expect(isMissingTableError(drizzleWrapped(pgUndefinedTable()))).toBe(true);
  });

  it('matches through more than one layer of wrapping', () => {
    expect(isMissingTableError(drizzleWrapped(drizzleWrapped(pgUndefinedTable())))).toBe(true);
  });

  it('matches newsletter_subscribers too, not just analytics_events', () => {
    expect(isMissingTableError(drizzleWrapped(pgUndefinedTable('newsletter_subscribers')))).toBe(true);
  });

  it('falls back to the message when no code survives the wrapping', () => {
    const messageOnly = new Error('relation "newsletter_subscribers" does not exist');
    expect(isMissingTableError(messageOnly)).toBe(true);
  });

  it('does not match unrelated database errors', () => {
    expect(isMissingTableError(Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }))).toBe(false);
    // 23505 = unique_violation — a real error, but not a missing table.
    expect(isMissingTableError(drizzleWrapped(Object.assign(new Error('dupe'), { code: '23505' })))).toBe(false);
  });

  it('handles null, undefined, and non-error values', () => {
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError(undefined)).toBe(false);
    expect(isMissingTableError('nope')).toBe(false);
  });

  it('terminates on a self-referential cause chain', () => {
    const cyclic = new Error('boom') as Error & { cause?: unknown };
    cyclic.cause = cyclic;
    expect(isMissingTableError(cyclic)).toBe(false);
  });
});
