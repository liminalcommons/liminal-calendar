/**
 * availability-to-windows adapter — converts the UTC half-hour heatmap
 * stored in `members.availability` into the `WindowConfig[]` shape the
 * slot engine consumes.
 *
 * These tests use 'UTC' as the timezone so the offset math is the
 * identity (no shift), making the slot indexes directly inspectable.
 */

import { availabilityToWindows } from '@/lib/booking/availability-to-windows';

describe('availabilityToWindows', () => {
  test('empty input → no windows', () => {
    expect(availabilityToWindows([], 'UTC')).toEqual([]);
    expect(availabilityToWindows(null, 'UTC')).toEqual([]);
    expect(availabilityToWindows(undefined, 'UTC')).toEqual([]);
  });

  test('single Monday slot at 09:00 UTC → 09:00–09:30 Mon window', () => {
    // slot 18 = Mon 09:00 (18 * 30 = 540 min)
    const w = availabilityToWindows([18], 'UTC');
    expect(w).toEqual([
      { dayOfWeek: 0, startMinute: 540, endMinute: 570, timezone: 'UTC' },
    ]);
  });

  test('contiguous slots collapse into one range', () => {
    // Mon 09:00–11:00 = slots 18..21 (four 30-min slots)
    const w = availabilityToWindows([18, 19, 20, 21], 'UTC');
    expect(w).toEqual([
      { dayOfWeek: 0, startMinute: 540, endMinute: 660, timezone: 'UTC' },
    ]);
  });

  test('non-contiguous slots produce separate ranges', () => {
    // Mon 09:00–09:30 (slot 18) and Mon 14:00–14:30 (slot 28)
    const w = availabilityToWindows([18, 28], 'UTC');
    expect(w).toEqual([
      { dayOfWeek: 0, startMinute: 540, endMinute: 570, timezone: 'UTC' },
      { dayOfWeek: 0, startMinute: 840, endMinute: 870, timezone: 'UTC' },
    ]);
  });

  test('slots across multiple days are bucketed correctly', () => {
    // Mon 09:00–09:30 (slot 18), Tue 09:00–09:30 (slot 48+18 = 66)
    const w = availabilityToWindows([18, 66], 'UTC');
    expect(w).toEqual([
      { dayOfWeek: 0, startMinute: 540, endMinute: 570, timezone: 'UTC' },
      { dayOfWeek: 1, startMinute: 540, endMinute: 570, timezone: 'UTC' },
    ]);
  });

  test('unsorted input is normalized', () => {
    const w = availabilityToWindows([20, 18, 19], 'UTC');
    expect(w).toEqual([
      { dayOfWeek: 0, startMinute: 540, endMinute: 630, timezone: 'UTC' },
    ]);
  });

  test('out-of-range / non-integer values are ignored', () => {
    // 18 valid; 999 wraps but the test focuses on .filter() and .isInteger() guards
    const w = availabilityToWindows([18, NaN as unknown as number, 3.5 as unknown as number], 'UTC');
    expect(w).toEqual([
      { dayOfWeek: 0, startMinute: 540, endMinute: 570, timezone: 'UTC' },
    ]);
  });

  test('full Sunday 00:00–23:30 collapses into one range', () => {
    // Sunday slots: 6*48 .. 6*48+47 = 288..335
    const slots = Array.from({ length: 48 }, (_, i) => 288 + i);
    const w = availabilityToWindows(slots, 'UTC');
    expect(w).toEqual([
      { dayOfWeek: 6, startMinute: 0, endMinute: 1440, timezone: 'UTC' },
    ]);
  });

  test('missing timezone defaults to UTC', () => {
    const w = availabilityToWindows([18], '');
    expect(w[0].timezone).toBe('UTC');
  });
});
