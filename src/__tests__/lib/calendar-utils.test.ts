import {
  toDateKey,
  getWeekStart,
  getWeekDays,
  formatDuration,
  getUpcomingEvents,
  groupEventsByDate,
} from '../../lib/calendar-utils';
import type { DisplayEvent } from '../../lib/display-event';

function makeEvent(id: string, startsAt: string, endsAt?: string): DisplayEvent {
  return {
    id,
    title: `Event ${id}`,
    description: null,
    starts_at: startsAt,
    ends_at: endsAt ?? null,
    event_url: null,
    creator_id: 'u1',
    creator_name: 'Test User',
    timezone: 'UTC',
    location: null,
    myResponse: null,
    attendees: { total: 0, going: 0, interested: 0 },
  };
}

describe('toDateKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(toDateKey(new Date('2026-03-28T10:00:00Z'))).toBe('2026-03-28');
  });

  it('handles midnight', () => {
    expect(toDateKey(new Date('2026-01-01T00:00:00'))).toBe('2026-01-01');
  });
});

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday', () => {
    const wed = new Date('2026-03-25'); // Wednesday
    const monday = getWeekStart(wed);
    expect(monday.getDay()).toBe(1); // 1 = Monday
  });

  it('returns the same day for a Monday', () => {
    const mon = new Date(2026, 2, 23); // Monday March 23, 2026 (month is 0-indexed)
    const result = getWeekStart(mon);
    expect(result.getDay()).toBe(1);
    expect(toDateKey(result)).toBe('2026-03-23');
  });

  it('returns Monday for a Sunday', () => {
    const sun = new Date(2026, 2, 29); // Sunday March 29, 2026
    const result = getWeekStart(sun);
    expect(result.getDay()).toBe(1);
    expect(toDateKey(result)).toBe('2026-03-23');
  });
});

describe('getWeekDays', () => {
  it('returns 7 days starting from Monday', () => {
    const monday = new Date(2026, 2, 23); // Monday March 23, 2026
    const days = getWeekDays(monday);
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(1); // Mon
    expect(days[6].getDay()).toBe(0); // Sun
  });

  it('days are consecutive', () => {
    const monday = new Date(2026, 2, 23);
    const days = getWeekDays(monday);
    for (let i = 1; i < 7; i++) {
      const diff = days[i].getTime() - days[i - 1].getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000);
    }
  });
});

describe('formatDuration', () => {
  it('returns empty string when endAt is null', () => {
    expect(formatDuration('2026-03-28T10:00:00Z', null)).toBe('');
  });

  it('returns empty string when endAt is undefined', () => {
    expect(formatDuration('2026-03-28T10:00:00Z', undefined)).toBe('');
  });

  it('formats exactly 1 hour', () => {
    expect(formatDuration('2026-03-28T10:00:00Z', '2026-03-28T11:00:00Z')).toBe('1 hour');
  });

  it('formats exactly 2 hours', () => {
    expect(formatDuration('2026-03-28T10:00:00Z', '2026-03-28T12:00:00Z')).toBe('2 hours');
  });

  it('formats 1.5 hours as 1h 30m', () => {
    expect(formatDuration('2026-03-28T10:00:00Z', '2026-03-28T11:30:00Z')).toBe('1h 30m');
  });

  it('formats 45 minutes', () => {
    expect(formatDuration('2026-03-28T10:00:00Z', '2026-03-28T10:45:00Z')).toBe('45m');
  });
});

describe('getUpcomingEvents', () => {
  it('filters out past events', () => {
    const past = makeEvent('past', '2020-01-01T10:00:00Z');
    const future = makeEvent('future', '2099-01-01T10:00:00Z');
    const result = getUpcomingEvents([past, future]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('future');
  });

  it('sorts by start time ascending', () => {
    const later = makeEvent('later', '2099-06-01T10:00:00Z');
    const sooner = makeEvent('sooner', '2099-01-01T10:00:00Z');
    const result = getUpcomingEvents([later, sooner]);
    expect(result[0].id).toBe('sooner');
    expect(result[1].id).toBe('later');
  });

  it('respects the limit parameter', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent(`e${i}`, `2099-0${(i % 9) + 1}-01T10:00:00Z`)
    );
    const result = getUpcomingEvents(events, 3);
    expect(result).toHaveLength(3);
  });

  it('defaults to limit of 20', () => {
    const events = Array.from({ length: 25 }, (_, i) =>
      makeEvent(`e${i}`, `2099-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`)
    );
    const result = getUpcomingEvents(events);
    expect(result).toHaveLength(20);
  });
});

describe('groupEventsByDate', () => {
  it('groups events by date key', () => {
    const e1 = makeEvent('1', '2026-03-28T10:00:00Z');
    const e2 = makeEvent('2', '2026-03-28T14:00:00Z');
    const e3 = makeEvent('3', '2026-03-29T09:00:00Z');
    const map = groupEventsByDate([e1, e2, e3]);
    expect(map.get('2026-03-28')).toHaveLength(2);
    expect(map.get('2026-03-29')).toHaveLength(1);
  });

  it('sorts events within a day by start time', () => {
    const later = makeEvent('later', '2026-03-28T14:00:00Z');
    const earlier = makeEvent('earlier', '2026-03-28T10:00:00Z');
    const map = groupEventsByDate([later, earlier]);
    const day = map.get('2026-03-28')!;
    expect(day[0].id).toBe('earlier');
    expect(day[1].id).toBe('later');
  });

  it('returns empty map for empty input', () => {
    expect(groupEventsByDate([])).toHaveProperty('size', 0);
  });
});
