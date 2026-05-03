import { eventToMinutes } from '@/lib/event-time-display';

describe('eventToMinutes', () => {
  it('returns local-TZ minutes-since-midnight for an ISO start', () => {
    const d = new Date(2026, 4, 3, 18, 0, 0);
    const ev = { starts_at: d.toISOString(), ends_at: null };
    expect(eventToMinutes(ev as never).startMinutes).toBe(18 * 60);
  });

  it('falls back to start+60min when ends_at missing', () => {
    const d = new Date(2026, 4, 3, 18, 0, 0);
    const ev = { starts_at: d.toISOString(), ends_at: null };
    expect(eventToMinutes(ev as never).endMinutes).toBe(19 * 60);
  });

  it('clamps to 24*60 when ends_at <= starts_at', () => {
    const start = new Date(2026, 4, 3, 23, 0, 0);
    const end = new Date(2026, 4, 3, 22, 0, 0);
    const ev = { starts_at: start.toISOString(), ends_at: end.toISOString() };
    expect(eventToMinutes(ev as never).endMinutes).toBe(24 * 60);
  });

  it('handles a normal 1-hour event', () => {
    const start = new Date(2026, 4, 3, 9, 30, 0);
    const end = new Date(2026, 4, 3, 10, 30, 0);
    const ev = { starts_at: start.toISOString(), ends_at: end.toISOString() };
    const out = eventToMinutes(ev as never);
    expect(out.startMinutes).toBe(9 * 60 + 30);
    expect(out.endMinutes).toBe(10 * 60 + 30);
  });
});
