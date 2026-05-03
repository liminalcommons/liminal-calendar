/**
 * eventEndedAt + eventHasEnded — shared helpers used by both
 * /api/events/[id]/attendance-report (route) and AttendanceReportSection (UI).
 *
 * Closes the dual time-gate WARN raised in Negativa Reviews 5 and 7.
 */

import { eventEndedAt, eventHasEnded } from '@/lib/event-time';

const ONE_HOUR_MS = 60 * 60 * 1000;

describe('eventEndedAt', () => {
  it('returns endsAt as a millisecond timestamp when present (string)', () => {
    const ends = '2026-04-04T19:30:00Z';
    expect(eventEndedAt({ startsAt: null, endsAt: ends })).toBe(
      new Date(ends).getTime(),
    );
  });

  it('returns endsAt as a millisecond timestamp when present (Date)', () => {
    const ends = new Date('2026-04-04T19:30:00Z');
    expect(eventEndedAt({ startsAt: null, endsAt: ends })).toBe(ends.getTime());
  });

  it('falls back to startsAt + 1h when endsAt is null', () => {
    const starts = '2026-04-04T18:00:00Z';
    const expected = new Date(starts).getTime() + ONE_HOUR_MS;
    expect(eventEndedAt({ startsAt: starts, endsAt: null })).toBe(expected);
  });

  it('returns 0 when both startsAt and endsAt are null (sentinel: ended)', () => {
    expect(eventEndedAt({ startsAt: null, endsAt: null })).toBe(0);
  });

  it('accepts both camelCase (Drizzle row) and snake_case (JSON wire)', () => {
    const ends = '2026-04-04T19:30:00Z';
    // snake_case (wire format)
    expect(
      eventEndedAt({
        starts_at: '2026-04-04T18:00:00Z',
        ends_at: ends,
      } as never),
    ).toBe(new Date(ends).getTime());
    // camelCase wins when both present
    expect(
      eventEndedAt({
        startsAt: '2020-01-01T00:00:00Z',
        endsAt: ends,
        starts_at: '2030-01-01T00:00:00Z',
        ends_at: '2030-01-01T00:00:00Z',
      } as never),
    ).toBe(new Date(ends).getTime());
  });
});

describe('eventHasEnded', () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

  it('returns true when endsAt is in the past', () => {
    expect(eventHasEnded({ startsAt: yesterday, endsAt: yesterday })).toBe(true);
  });

  it('returns false when endsAt is in the future', () => {
    expect(eventHasEnded({ startsAt: tomorrow, endsAt: tomorrow })).toBe(false);
  });

  it('returns true when endsAt is null and startsAt + 1h is in the past', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    expect(eventHasEnded({ startsAt: twoHoursAgo, endsAt: null })).toBe(true);
  });

  it('returns false when endsAt is null and startsAt + 1h is in the future', () => {
    const startsIn30 = new Date(Date.now() + 30 * 60_000).toISOString();
    expect(eventHasEnded({ startsAt: startsIn30, endsAt: null })).toBe(false);
  });

  it('returns false when both are null (preserves the dual-null sentinel)', () => {
    // 0 < Date.now() so eventEndedAt sentinel of 0 should NOT mean "ended".
    // Defensive: an event with no times shouldn't be confidently "ended".
    expect(eventHasEnded({ startsAt: null, endsAt: null })).toBe(false);
  });
});
