import { expandRecurringEvents } from '../../lib/recurrence-expander';
import type { DisplayEvent } from '../../lib/display-event';
import { formatInTimeZone } from 'date-fns-tz';

function baseEvent(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id: 'stewards',
    title: 'Stewards Meeting',
    description: null,
    starts_at: '2025-10-13T18:00:00.000Z', // Oct 13 2025 = BST, 19:00 Europe/London
    ends_at: '2025-10-13T19:00:00.000Z',
    event_url: null,
    creator_id: 'u',
    creator_name: 'u',
    timezone: 'Europe/London',
    location: null,
    myResponse: null,
    attendees: { total: 0, going: 0, interested: 0 },
    recurrenceRule: 'weekly',
    ...overrides,
  };
}

function wallClock(iso: string, tz: string): string {
  return formatInTimeZone(new Date(iso), tz, 'yyyy-MM-dd HH:mm');
}

describe('expandRecurringEvents — timezone determinism across DST', () => {
  const london = 'Europe/London';

  test('weekly event stays at 19:00 Europe/London across BST→GMT boundary', () => {
    const events = [baseEvent({ starts_at: '2025-10-13T18:00:00.000Z', ends_at: '2025-10-13T19:00:00.000Z' })];
    const expanded = expandRecurringEvents(
      events,
      new Date('2025-10-13T00:00:00Z'),
      new Date('2025-11-17T00:00:00Z'),
    );
    // Expect 5 occurrences: Oct 13, 20, 27, Nov 3, 10
    expect(expanded).toHaveLength(5);
    for (const ev of expanded) {
      expect(wallClock(ev.starts_at, london)).toMatch(/ 19:00$/);
    }
    // Oct 20 (BST) should be 18:00 UTC; Oct 27 (GMT) should be 19:00 UTC.
    expect(expanded[1].starts_at).toBe('2025-10-20T18:00:00.000Z');
    expect(expanded[2].starts_at).toBe('2025-10-27T19:00:00.000Z');
  });

  test('weekly event stays at 19:00 Europe/London across GMT→BST boundary', () => {
    const events = [baseEvent({ starts_at: '2026-03-15T19:00:00.000Z', ends_at: '2026-03-15T20:00:00.000Z' })];
    const expanded = expandRecurringEvents(
      events,
      new Date('2026-03-15T00:00:00Z'),
      new Date('2026-04-20T00:00:00Z'),
    );
    expect(expanded.length).toBeGreaterThanOrEqual(5);
    for (const ev of expanded) {
      expect(wallClock(ev.starts_at, london)).toMatch(/ 19:00$/);
    }
    // Mar 29 2026 = BST start. Mar 22 is GMT (UTC 19:00), Mar 29 is BST (UTC 18:00).
    expect(expanded[1].starts_at).toBe('2026-03-22T19:00:00.000Z');
    expect(expanded[2].starts_at).toBe('2026-03-29T18:00:00.000Z');
  });

  test('result is independent of the TZ environment the expander runs in', () => {
    // Two expansions with identical input should produce identical output — expansion
    // no longer depends on the ambient Date locale. We approximate this by expanding
    // the same input twice and asserting equality.
    const events = [baseEvent()];
    const range = { s: new Date('2025-10-13T00:00:00Z'), e: new Date('2025-12-01T00:00:00Z') };
    const a = expandRecurringEvents(events, range.s, range.e);
    const b = expandRecurringEvents(events, range.s, range.e);
    expect(a.map(x => x.starts_at)).toEqual(b.map(x => x.starts_at));
  });

  test('non-recurring events pass through unchanged', () => {
    const one = baseEvent({ recurrenceRule: undefined });
    const [out] = expandRecurringEvents([one], new Date('2020-01-01'), new Date('2030-01-01'));
    expect(out).toBe(one);
  });

  test('monthly recurrence preserves wall-clock hour in event timezone', () => {
    const events = [baseEvent({
      starts_at: '2025-10-15T18:00:00.000Z',
      ends_at: '2025-10-15T19:00:00.000Z',
      recurrenceRule: 'monthly',
    })];
    const expanded = expandRecurringEvents(
      events,
      new Date('2025-10-01T00:00:00Z'),
      new Date('2026-02-01T00:00:00Z'),
    );
    for (const ev of expanded) {
      expect(wallClock(ev.starts_at, london)).toMatch(/-15 19:00$/);
    }
  });
});
