import {
  getTimeOfDay,
  getUserTimezone,
  isLateNightInAnyTimezone,
  getTimeEmoji,
  getHourInTimezone,
} from '../../lib/timezone-utils';

describe('getTimeOfDay', () => {
  it('classifies 10 as day', () => {
    expect(getTimeOfDay(10)).toBe('day');
  });

  it('classifies 8 as day (boundary)', () => {
    expect(getTimeOfDay(8)).toBe('day');
  });

  it('classifies 17 as day (boundary)', () => {
    expect(getTimeOfDay(17)).toBe('day');
  });

  it('classifies 6 as dawn', () => {
    expect(getTimeOfDay(6)).toBe('dawn');
  });

  it('classifies 7 as dawn', () => {
    expect(getTimeOfDay(7)).toBe('dawn');
  });

  it('classifies 19 as dusk', () => {
    expect(getTimeOfDay(19)).toBe('dusk');
  });

  it('classifies 18 as dusk (boundary)', () => {
    expect(getTimeOfDay(18)).toBe('dusk');
  });

  it('classifies 20 as dusk (boundary)', () => {
    expect(getTimeOfDay(20)).toBe('dusk');
  });

  it('classifies 23 as late_night', () => {
    expect(getTimeOfDay(23)).toBe('late_night');
  });

  it('classifies 3 as late_night', () => {
    expect(getTimeOfDay(3)).toBe('late_night');
  });

  it('classifies 0 as late_night', () => {
    expect(getTimeOfDay(0)).toBe('late_night');
  });

  it('classifies 21 as late_night', () => {
    expect(getTimeOfDay(21)).toBe('late_night');
  });
});

describe('getTimeEmoji', () => {
  it('returns sun for day', () => {
    expect(getTimeEmoji('day')).toBe('☀️');
  });

  it('returns sunrise for dawn', () => {
    expect(getTimeEmoji('dawn')).toBe('🌅');
  });

  it('returns sunset for dusk', () => {
    expect(getTimeEmoji('dusk')).toBe('🌇');
  });

  it('returns moon for night', () => {
    expect(getTimeEmoji('night')).toBe('🌙');
  });

  it('returns moon for late_night', () => {
    expect(getTimeEmoji('late_night')).toBe('🌙');
  });
});

describe('getUserTimezone', () => {
  it('returns a non-empty string', () => {
    const tz = getUserTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  it('returns a valid IANA timezone or UTC', () => {
    const tz = getUserTimezone();
    // Should not throw
    expect(() => Intl.DateTimeFormat(undefined, { timeZone: tz })).not.toThrow();
  });
});

describe('isLateNightInAnyTimezone', () => {
  it('returns true when hour is 23 in any timezone', () => {
    // Use a fixed date at 23:00 UTC
    const date = new Date('2026-03-28T23:00:00Z');
    const result = isLateNightInAnyTimezone(date, ['UTC']);
    expect(result).toBe(true);
  });

  it('returns true when hour is 3 in any timezone', () => {
    const date = new Date('2026-03-28T03:00:00Z');
    const result = isLateNightInAnyTimezone(date, ['UTC']);
    expect(result).toBe(true);
  });

  it('returns false when midday in all timezones', () => {
    const date = new Date('2026-03-28T12:00:00Z');
    const result = isLateNightInAnyTimezone(date, ['UTC', 'Europe/London']);
    expect(result).toBe(false);
  });

  it('returns true when late in at least one timezone', () => {
    // 22:00 UTC — late in UTC but daytime elsewhere would still return true due to UTC
    const date = new Date('2026-03-28T22:00:00Z');
    const result = isLateNightInAnyTimezone(date, ['America/New_York', 'UTC']);
    expect(result).toBe(true);
  });

  it('returns false for empty timezone array', () => {
    const date = new Date('2026-03-28T23:00:00Z');
    expect(isLateNightInAnyTimezone(date, [])).toBe(false);
  });
});

describe('getHourInTimezone', () => {
  it('returns correct hour for UTC', () => {
    const date = new Date('2026-03-28T15:00:00Z');
    expect(getHourInTimezone(date, 'UTC')).toBe(15);
  });

  it('returns correct hour for offset timezone', () => {
    // New York is UTC-4 in March (DST active)
    const date = new Date('2026-03-28T20:00:00Z');
    const hour = getHourInTimezone(date, 'America/New_York');
    expect(hour).toBe(16);
  });
});
