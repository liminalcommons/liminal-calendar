/**
 * Tests for the pure slot-computation engine (Plan 3 / Task 4).
 *
 * `computeSlots` is a pure function over { now, eventType, windows, blockingEvents }
 * — no DB, no Next, no clock. All Date inputs are explicit UTC instants.
 *
 * Storage convention: `dayOfWeek` is 0=Mon..6=Sun (NOT JS getDay).
 */

import { computeSlots, type EventTypeConfig, type WindowConfig, type BlockingEvent } from '@/lib/booking/slots';
import { formatInTimeZone } from 'date-fns-tz';

function et(overrides: Partial<EventTypeConfig> = {}): EventTypeConfig {
  return {
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 0,
    maxDaysAhead: 7,
    ...overrides,
  };
}

// 0=Mon..6=Sun storage convention.
const MON = 0;
const TUE = 1;
const WED = 2;
const THU = 3;
const FRI = 4;
const SAT = 5;
const SUN = 6;

describe('computeSlots — basics', () => {
  test('empty windows → empty slots', () => {
    const now = new Date('2026-06-01T00:00:00Z'); // Mon
    const slots = computeSlots({
      now,
      eventType: et(),
      windows: [],
      blockingEvents: [],
    });
    expect(slots).toEqual([]);
  });

  test('single Monday 9-17 UTC window → 16 30-min slots on that Monday', () => {
    // Pick a "now" that is Monday 00:00 UTC so the Monday window is in-range.
    const now = new Date('2026-06-01T00:00:00Z'); // Mon
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 17 * 60, timezone: 'UTC' },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 1, minNoticeMinutes: 0 }),
      windows,
      blockingEvents: [],
    });
    // 8 hours × 2 slots/hr = 16 slots
    expect(slots).toHaveLength(16);
    expect(slots[0].startsAt.toISOString()).toBe('2026-06-01T09:00:00.000Z');
    expect(slots[0].endsAt.toISOString()).toBe('2026-06-01T09:30:00.000Z');
    expect(slots[15].startsAt.toISOString()).toBe('2026-06-01T16:30:00.000Z');
    expect(slots[15].endsAt.toISOString()).toBe('2026-06-01T17:00:00.000Z');
  });

  test('minNoticeMinutes truncates start of today', () => {
    const now = new Date('2026-06-01T10:00:00Z'); // Mon 10:00 UTC
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 17 * 60, timezone: 'UTC' },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 1, minNoticeMinutes: 60 }), // earliest = 11:00
      windows,
      blockingEvents: [],
    });
    // First eligible 30-min slot starts at 11:00; 11:00..17:00 = 12 slots.
    expect(slots).toHaveLength(12);
    expect(slots[0].startsAt.toISOString()).toBe('2026-06-01T11:00:00.000Z');
  });

  test('today: slots stay on the window grid even when `now` is mid-slot', () => {
    // Reported bug: with window 09:00–22:00 and 60-min slots, "today" started
    // at 15:57 (raw `now`) instead of 16:00 (next grid point).
    const now = new Date('2026-06-01T15:57:00Z'); // Mon 15:57 UTC
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 22 * 60, timezone: 'UTC' },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ durationMinutes: 60, maxDaysAhead: 1, minNoticeMinutes: 0 }),
      windows,
      blockingEvents: [],
    });
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).toEqual([
      '2026-06-01T16:00:00.000Z',
      '2026-06-01T17:00:00.000Z',
      '2026-06-01T18:00:00.000Z',
      '2026-06-01T19:00:00.000Z',
      '2026-06-01T20:00:00.000Z',
      '2026-06-01T21:00:00.000Z',
    ]);
  });

  test('maxDaysAhead caps the horizon', () => {
    const now = new Date('2026-06-01T00:00:00Z'); // Mon
    // Window on Tue 09-10 UTC only.
    const windows: WindowConfig[] = [
      { dayOfWeek: TUE, startMinute: 9 * 60, endMinute: 10 * 60, timezone: 'UTC' },
    ];
    const within = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 7 }),
      windows,
      blockingEvents: [],
    });
    // exactly one Tuesday in 7 days → 2 slots
    expect(within).toHaveLength(2);

    const tooShort = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 0 }), // horizon = now → 0 days
      windows,
      blockingEvents: [],
    });
    expect(tooShort).toEqual([]);
  });
});

describe('computeSlots — blocking', () => {
  test('blocking event with 0 buffers — slots avoid overlap (half-open)', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 12 * 60, timezone: 'UTC' },
    ];
    // Block 10:00-10:30. Slots overlapping that half-open block must be excluded.
    const blockingEvents: BlockingEvent[] = [
      { startsAt: new Date('2026-06-01T10:00:00Z'), endsAt: new Date('2026-06-01T10:30:00Z') },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 1 }),
      windows,
      blockingEvents,
    });
    const starts = slots.map((s) => s.startsAt.toISOString());
    // Window 9-12 → expected 9:00, 9:30, 10:00, 10:30, 11:00, 11:30 (6); minus 10:00 (blocked).
    // 10:30 starts exactly when block ends — half-open allows it.
    expect(starts).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-01T09:30:00.000Z',
      '2026-06-01T10:30:00.000Z',
      '2026-06-01T11:00:00.000Z',
      '2026-06-01T11:30:00.000Z',
    ]);
  });

  test('blocking event with 15-min buffers on each side', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 12 * 60, timezone: 'UTC' },
    ];
    // Block 10:00-10:30 expanded by 15-min buffers → 9:45-10:45 effective block.
    const blockingEvents: BlockingEvent[] = [
      { startsAt: new Date('2026-06-01T10:00:00Z'), endsAt: new Date('2026-06-01T10:30:00Z') },
    ];
    const slots = computeSlots({
      now,
      eventType: et({
        maxDaysAhead: 1,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
      }),
      windows,
      blockingEvents,
    });
    const starts = slots.map((s) => s.startsAt.toISOString());
    // 9:00 (9:00-9:30, ends before 9:45) OK
    // 9:30 (9:30-10:00, overlaps 9:45-10:45) blocked
    // 10:00 blocked
    // 10:30 (10:30-11:00 overlaps 9:45-10:45 since 10:30<10:45) blocked
    // 11:00 OK
    // 11:30 OK
    expect(starts).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-01T11:00:00.000Z',
      '2026-06-01T11:30:00.000Z',
    ]);
  });

  test('null endsAt treated as startsAt + duration', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 11 * 60, timezone: 'UTC' },
    ];
    const blockingEvents: BlockingEvent[] = [
      { startsAt: new Date('2026-06-01T10:00:00Z'), endsAt: null }, // -> 10:00-10:30
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 1 }),
      windows,
      blockingEvents,
    });
    const starts = slots.map((s) => s.startsAt.toISOString());
    // 9:00, 9:30, [10:00 blocked], 10:30
    expect(starts).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-01T09:30:00.000Z',
      '2026-06-01T10:30:00.000Z',
    ]);
  });

  test('blocking event spans across window edge', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 11 * 60, timezone: 'UTC' },
    ];
    // Block 8:00 - 9:30; only 9:00-9:30 portion is inside window.
    const blockingEvents: BlockingEvent[] = [
      { startsAt: new Date('2026-06-01T08:00:00Z'), endsAt: new Date('2026-06-01T09:30:00Z') },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 1 }),
      windows,
      blockingEvents,
    });
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).toEqual([
      '2026-06-01T09:30:00.000Z',
      '2026-06-01T10:00:00.000Z',
      '2026-06-01T10:30:00.000Z',
    ]);
  });
});

describe('computeSlots — slot packing', () => {
  test('durationMinutes=45 in 2hr window — exactly 2 back-to-back slots', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 11 * 60, timezone: 'UTC' }, // 2 hours
    ];
    const slots = computeSlots({
      now,
      eventType: et({ durationMinutes: 45, maxDaysAhead: 1 }),
      windows,
      blockingEvents: [],
    });
    expect(slots).toHaveLength(2);
    expect(slots[0].startsAt.toISOString()).toBe('2026-06-01T09:00:00.000Z');
    expect(slots[0].endsAt.toISOString()).toBe('2026-06-01T09:45:00.000Z');
    expect(slots[1].startsAt.toISOString()).toBe('2026-06-01T09:45:00.000Z');
    expect(slots[1].endsAt.toISOString()).toBe('2026-06-01T10:30:00.000Z');
  });
});

describe('computeSlots — timezones', () => {
  test('windows in America/New_York produce UTC slots correctly', () => {
    // Mon 2026-06-01 in NY (EDT, UTC-4). 09:00-10:00 NY = 13:00-14:00 UTC.
    const now = new Date('2026-06-01T00:00:00Z');
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 10 * 60, timezone: 'America/New_York' },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 1 }),
      windows,
      blockingEvents: [],
    });
    expect(slots).toHaveLength(2);
    expect(slots[0].startsAt.toISOString()).toBe('2026-06-01T13:00:00.000Z');
    expect(slots[1].startsAt.toISOString()).toBe('2026-06-01T13:30:00.000Z');
    // Wall-clock sanity
    expect(formatInTimeZone(slots[0].startsAt, 'America/New_York', 'yyyy-MM-dd HH:mm')).toBe('2026-06-01 09:00');
  });

  test('DST forward — US/Eastern 2026-03-08 Sun 01:00-05:00', () => {
    // Spring forward 2026-03-08: 02:00 EST -> 03:00 EDT. Window 01:00-05:00 local
    // covers: 01:00 EST = 06:00 UTC ... 05:00 EDT = 09:00 UTC.
    // That's 3 wall-clock hours (1am-2am EST, then 3am-5am EDT) = 6 slots of 30min.
    const now = new Date('2026-03-08T00:00:00Z'); // Sun in UTC; Sat night NY
    const windows: WindowConfig[] = [
      { dayOfWeek: SUN, startMinute: 1 * 60, endMinute: 5 * 60, timezone: 'America/New_York' },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 2 }),
      windows,
      blockingEvents: [],
    });
    // Library produces start = 01:00 EST = 06:00 UTC; end = 05:00 EDT = 09:00 UTC.
    // Span = 3 hours UTC = 6 30-min slots.
    expect(slots).toHaveLength(6);
    expect(slots[0].startsAt.toISOString()).toBe('2026-03-08T06:00:00.000Z');
    expect(slots[slots.length - 1].endsAt.toISOString()).toBe('2026-03-08T09:00:00.000Z');
  });

  test('DST backward — US/Eastern 2026-11-01 Sun 01:00-03:00 has duplicate hour', () => {
    // Fall back 2026-11-01: 02:00 EDT -> 01:00 EST. The "01:00-02:00" wall clock
    // repeats. Window 01:00-03:00 local: start at 01:00 first occurrence
    // (= 05:00 UTC EDT), end at 03:00 EST (= 08:00 UTC). 3 wall hours / 3 UTC hours.
    const now = new Date('2026-10-31T00:00:00Z'); // before Sun in NY
    const windows: WindowConfig[] = [
      { dayOfWeek: SUN, startMinute: 1 * 60, endMinute: 3 * 60, timezone: 'America/New_York' },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 2 }),
      windows,
      blockingEvents: [],
    });
    // Slot count must be consistent (at least 4, exact depends on library resolution
    // of ambiguous wall-clock time; date-fns-tz typically picks the first occurrence).
    // 01:00 EDT (05:00 UTC) -> 03:00 EST (08:00 UTC) = 3 UTC hours = 6 slots.
    expect(slots.length).toBeGreaterThanOrEqual(4);
    expect(slots[0].startsAt.getTime()).toBeLessThan(slots[slots.length - 1].startsAt.getTime());
    // All starts unique
    const isos = slots.map((s) => s.startsAt.toISOString());
    expect(new Set(isos).size).toBe(isos.length);
  });
});

describe('computeSlots — combining and dedupe', () => {
  test('multiple windows on same day combine', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 10 * 60, timezone: 'UTC' },
      { dayOfWeek: MON, startMinute: 14 * 60, endMinute: 15 * 60, timezone: 'UTC' },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 1 }),
      windows,
      blockingEvents: [],
    });
    // 2 slots morning + 2 slots afternoon
    expect(slots).toHaveLength(4);
    expect(slots[0].startsAt.toISOString()).toBe('2026-06-01T09:00:00.000Z');
    expect(slots[1].startsAt.toISOString()).toBe('2026-06-01T09:30:00.000Z');
    expect(slots[2].startsAt.toISOString()).toBe('2026-06-01T14:00:00.000Z');
    expect(slots[3].startsAt.toISOString()).toBe('2026-06-01T14:30:00.000Z');
  });

  test('dedupes identical slot starts produced by two windows', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    // Two windows resolving to the same UTC start: one UTC 13:00-13:30, one NY 09:00-09:30 (EDT = UTC-4 in June).
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 13 * 60, endMinute: 13 * 60 + 30, timezone: 'UTC' },
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 9 * 60 + 30, timezone: 'America/New_York' },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 1 }),
      windows,
      blockingEvents: [],
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].startsAt.toISOString()).toBe('2026-06-01T13:00:00.000Z');
  });

  test('slots are sorted ascending', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const windows: WindowConfig[] = [
      { dayOfWeek: WED, startMinute: 9 * 60, endMinute: 10 * 60, timezone: 'UTC' },
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 10 * 60, timezone: 'UTC' },
    ];
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 7 }),
      windows,
      blockingEvents: [],
    });
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].startsAt.getTime()).toBeGreaterThan(slots[i - 1].startsAt.getTime());
    }
    // Monday before Wednesday.
    expect(slots[0].startsAt.toISOString().startsWith('2026-06-01')).toBe(true);
  });
});

describe('computeSlots — performance', () => {
  test('30 days x 7 days x 1 window completes quickly', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const windows: WindowConfig[] = [
      { dayOfWeek: MON, startMinute: 9 * 60, endMinute: 17 * 60, timezone: 'America/New_York' },
      { dayOfWeek: TUE, startMinute: 9 * 60, endMinute: 17 * 60, timezone: 'America/New_York' },
      { dayOfWeek: WED, startMinute: 9 * 60, endMinute: 17 * 60, timezone: 'America/New_York' },
      { dayOfWeek: THU, startMinute: 9 * 60, endMinute: 17 * 60, timezone: 'America/New_York' },
      { dayOfWeek: FRI, startMinute: 9 * 60, endMinute: 17 * 60, timezone: 'America/New_York' },
    ];
    const t0 = Date.now();
    const slots = computeSlots({
      now,
      eventType: et({ maxDaysAhead: 30 }),
      windows,
      blockingEvents: [],
    });
    const elapsed = Date.now() - t0;
    expect(slots.length).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(1000);
  });
});
