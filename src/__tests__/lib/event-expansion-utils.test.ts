import {
  POPOVER_APPROX_HEIGHT,
  computePopoverPosition,
  formatEventDuration,
  getOriginalEventId,
} from '@/components/calendar/event-expansion-utils';

describe('computePopoverPosition', () => {
  const viewport = { width: 1200, height: 800 };
  const W = 360;

  it('places the popover to the right of the anchor when there is room', () => {
    const pos = computePopoverPosition({ left: 200, right: 280, top: 100 }, viewport, W);
    expect(pos).toEqual({ top: 100, left: 288 });
  });

  it('flips to the left side when right placement would overflow the viewport', () => {
    // anchor.right + 8 + 360 = 1248 > 1192 (width - 8) → flip
    const pos = computePopoverPosition({ left: 900, right: 980, top: 100 }, viewport, W);
    expect(pos.left).toBe(900 - W - 8); // 532
  });

  it('clamps left to 8 when even the flipped position would be off-screen', () => {
    const pos = computePopoverPosition({ left: 100, right: 1190, top: 100 }, viewport, W);
    // right placement: 1198, overflows → flip → left = 100 - 360 - 8 = -268 → clamp to 8
    expect(pos.left).toBe(8);
  });

  it('shifts the popover up when placing at anchor.top would overflow the bottom', () => {
    const pos = computePopoverPosition(
      { left: 200, right: 280, top: 700 },
      viewport,
      W,
      POPOVER_APPROX_HEIGHT,
    );
    // 700 + 420 = 1120 > 792 → top = max(8, 800 - 420 - 8) = 372
    expect(pos.top).toBe(372);
  });

  it('clamps top to 8 at the very top of the viewport', () => {
    const pos = computePopoverPosition({ left: 200, right: 280, top: -50 }, viewport, W);
    expect(pos.top).toBe(8);
  });
});

describe('formatEventDuration', () => {
  it('formats sub-hour durations as minutes', () => {
    expect(formatEventDuration('2026-04-20T18:00:00Z', '2026-04-20T18:30:00Z')).toBe('30m');
  });

  it('formats exact hour durations as hours', () => {
    expect(formatEventDuration('2026-04-20T18:00:00Z', '2026-04-20T20:00:00Z')).toBe('2h');
  });

  it('formats mixed durations as "Xh Ym"', () => {
    expect(formatEventDuration('2026-04-20T18:00:00Z', '2026-04-20T19:45:00Z')).toBe('1h 45m');
  });

  it('assumes 1h when endsAt is null', () => {
    expect(formatEventDuration('2026-04-20T18:00:00Z', null)).toBe('1h');
  });
});

describe('getOriginalEventId', () => {
  it('strips the -YYYYMMDD suffix from recurring-instance ids', () => {
    expect(getOriginalEventId('42-20260401')).toBe('42');
  });

  it('returns the id unchanged when there is no recurrence suffix', () => {
    expect(getOriginalEventId('42')).toBe('42');
  });

  it('does not strip non-date 8-digit suffixes when they are not preceded by a dash', () => {
    expect(getOriginalEventId('42_20260401')).toBe('42_20260401');
  });
});
