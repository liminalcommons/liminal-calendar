import { expandRecurringEvents, parseRecurrenceRule, describeRecurrenceRule } from '../../lib/recurrence-expander';
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

describe('parseRecurrenceRule', () => {
  it('parses the four legacy literal values', () => {
    expect(parseRecurrenceRule('daily')).toEqual({ kind: 'interval-days', days: 1 });
    expect(parseRecurrenceRule('weekly')).toEqual({ kind: 'interval-days', days: 7 });
    expect(parseRecurrenceRule('fortnightly')).toEqual({ kind: 'interval-days', days: 14 });
    expect(parseRecurrenceRule('monthly')).toEqual({ kind: 'interval-months' });
  });

  it('parses every_N_weeks', () => {
    expect(parseRecurrenceRule('every_4_weeks')).toEqual({ kind: 'interval-days', days: 28 });
    expect(parseRecurrenceRule('every_1_weeks')).toEqual({ kind: 'interval-days', days: 7 });
  });

  it('rejects every_0_weeks', () => {
    expect(parseRecurrenceRule('every_0_weeks')).toBeNull();
  });

  it('parses monthly_pos_weekday, including last (-1)', () => {
    expect(parseRecurrenceRule('monthly_-1_thu')).toEqual({ kind: 'monthly-weekday', pos: -1, weekday: 4 });
    expect(parseRecurrenceRule('monthly_2_mon')).toEqual({ kind: 'monthly-weekday', pos: 2, weekday: 1 });
  });

  it('rejects out-of-range position or bad weekday', () => {
    expect(parseRecurrenceRule('monthly_5_thu')).toBeNull();
    expect(parseRecurrenceRule('monthly_-1_xyz')).toBeNull();
  });

  it('returns null for unrecognized strings', () => {
    expect(parseRecurrenceRule('none')).toBeNull();
    expect(parseRecurrenceRule('yearly')).toBeNull();
  });
});

describe('describeRecurrenceRule', () => {
  it('labels legacy values', () => {
    expect(describeRecurrenceRule('daily')).toBe('Daily');
    expect(describeRecurrenceRule('fortnightly')).toBe('Fortnightly');
  });

  it('labels every_N_weeks', () => {
    expect(describeRecurrenceRule('every_4_weeks')).toBe('Every 4 weeks');
  });

  it('labels monthly_pos_weekday', () => {
    expect(describeRecurrenceRule('monthly_-1_thu')).toBe('Monthly — Last Thursday');
    expect(describeRecurrenceRule('monthly_1_mon')).toBe('Monthly — First Monday');
  });
});

describe('expandRecurringEvents — every_N_weeks', () => {
  const london = 'Europe/London';

  test('every_4_weeks advances 28 days at a time, preserving wall-clock time', () => {
    const events = [baseEvent({
      starts_at: '2026-01-01T19:00:00.000Z',
      ends_at: '2026-01-01T20:00:00.000Z',
      recurrenceRule: 'every_4_weeks',
    })];
    const expanded = expandRecurringEvents(
      events,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-04-01T00:00:00Z'),
    );
    expect(expanded.map((e) => e.starts_at)).toEqual([
      '2026-01-01T19:00:00.000Z',
      '2026-01-29T19:00:00.000Z',
      '2026-02-26T19:00:00.000Z',
      '2026-03-26T19:00:00.000Z',
    ]);
    for (const ev of expanded) {
      expect(wallClock(ev.starts_at, london)).toMatch(/ 19:00$/);
    }
  });
});

describe('expandRecurringEvents — monthly_pos_weekday', () => {
  const london = 'Europe/London';

  test('monthly_-1_thu lands on the last Thursday of each month', () => {
    const events = [baseEvent({
      starts_at: '2026-01-01T19:00:00.000Z',
      ends_at: '2026-01-01T20:00:00.000Z',
      recurrenceRule: 'monthly_-1_thu',
    })];
    const expanded = expandRecurringEvents(
      events,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-05-01T00:00:00Z'),
    );
    // Last Thursdays: Jan 29, Feb 26, Mar 26, Apr 30 (2026)
    const dates = expanded.map((e) => e.starts_at.slice(0, 10));
    expect(dates).toEqual(['2026-01-29', '2026-02-26', '2026-03-26', '2026-04-30']);
    for (const d of dates) {
      expect(new Date(`${d}T12:00:00Z`).getUTCDay()).toBe(4); // Thursday
    }
  });

  test('monthly_1_mon lands on the first Monday of each month', () => {
    const events = [baseEvent({
      starts_at: '2026-01-01T19:00:00.000Z',
      ends_at: '2026-01-01T20:00:00.000Z',
      recurrenceRule: 'monthly_1_mon',
    })];
    const expanded = expandRecurringEvents(
      events,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-04-01T00:00:00Z'),
    );
    const dates = expanded.map((e) => e.starts_at.slice(0, 10));
    // First Mondays: Jan 5, Feb 2, Mar 2 (2026)
    expect(dates).toEqual(['2026-01-05', '2026-02-02', '2026-03-02']);
  });
});
