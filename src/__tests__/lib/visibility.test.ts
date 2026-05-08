import { visibleEventsForUserCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';

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

describe('publicOnlyEventsCondition', () => {
  it('returns a SQL fragment referencing visibility', () => {
    const cond = publicOnlyEventsCondition();
    const debug = (cond.queryChunks ?? [])
      .map((c: any) => (typeof c === 'string' ? c : c?.value ?? ''))
      .join(' ');
    expect(debug).toMatch(/visibility/);
  });
});
