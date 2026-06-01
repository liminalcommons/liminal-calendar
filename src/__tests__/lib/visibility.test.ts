import {
  visibleEventsForUserCondition,
  publicOnlyEventsCondition,
  eventsStartingOnOrAfter,
} from '@/lib/events/visibility';

function debugSql(cond: { queryChunks?: unknown[] }): string {
  return (cond.queryChunks ?? [])
    .map((c: any) => (typeof c === 'string' ? c : c?.value ?? c?.name ?? ''))
    .join(' ');
}

describe('visibleEventsForUserCondition', () => {
  it('returns a SQL fragment that references all four predicates', () => {
    const cond = visibleEventsForUserCondition('user-123');
    const debug = (cond.queryChunks ?? [])
      .map((c: any) => (typeof c === 'string' ? c : c?.value ?? ''))
      .join(' ');
    expect(debug).toMatch(/visibility/);
    expect(debug).toMatch(/creator_id/);
    expect(debug).toMatch(/rsvps/);
    expect(debug).toMatch(/event_invitations/);
  });

  it('throws when userId is empty', () => {
    expect(() => visibleEventsForUserCondition('')).toThrow();
  });
});

describe('eventsStartingOnOrAfter — recurring-master bypass', () => {
  // Regression: recurring events store their original anchor in starts_at
  // (often months in the past). A plain `starts_at >= from` lower bound drops
  // those masters once the rolling window start advances past the anchor (this
  // fired on the 2026-06-01 month rollover, hiding every April-anchored weekly
  // series from month + list views). The lower bound must therefore exempt any
  // row carrying a recurrence_rule, so the client-side expander still receives
  // the master and can project its in-window occurrences.
  it('exempts rows with a recurrence_rule from the lower date bound', () => {
    const debug = debugSql(eventsStartingOnOrAfter(new Date('2026-05-01T00:00:00Z')));
    expect(debug).toMatch(/starts_at/);
    expect(debug).toMatch(/recurrence_rule/);
  });

  // Regression (2026-06-01): the lower bound interpolated a raw JS `Date` into
  // the sql`` template. Drizzle's sql tag has no column-type context there, so
  // postgres-js bound the Date's default toString() form
  // ("Fri May 01 2026 00:00:00 GMT+0000 (Coordinated Universal Time)"), which
  // Postgres cannot cast to timestamptz → every `from`-bounded query 500'd
  // ("Failed to fetch events"), bouncing /, /month and /list to the landing
  // page. The bound param MUST be an ISO-8601 string.
  it('binds the lower-bound date as an ISO-8601 string param, not a raw Date', () => {
    const from = new Date('2026-05-01T00:00:00Z');
    const cond = eventsStartingOnOrAfter(from) as unknown as { queryChunks?: unknown[] };
    // Interpolated params appear as bare chunks between the StringChunk objects
    // (which carry a `.value` array of literal SQL text). The bound date must be
    // an ISO string chunk, never a Date instance.
    const paramChunks = (cond.queryChunks ?? []).filter(
      (c: any) => !(c && typeof c === 'object' && Array.isArray(c.value)),
    );
    expect(paramChunks).toContain(from.toISOString());
    expect(paramChunks.some((v: unknown) => v instanceof Date)).toBe(false);
  });
});

describe('publicOnlyEventsCondition', () => {
  it('returns a SQL fragment referencing visibility', () => {
    const cond = publicOnlyEventsCondition();
    const debug = (cond.queryChunks ?? [])
      .map((c: any) => (typeof c === 'string' ? c : c?.value ?? ''))
      .join(' ');
    expect(debug).toMatch(/visibility/);
  });
});
