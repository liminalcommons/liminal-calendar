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
