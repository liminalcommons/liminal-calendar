import { pxToMinutesSnapped, applyDeltaMinutes } from '@/lib/drag-reschedule';

describe('pxToMinutesSnapped', () => {
  // each 30-min slot is 20px tall; 48 slots cover the day
  const heights = new Array(48).fill(20);
  const offsets = new Array(48).fill(0).map((_, i) => i * 20);

  it('returns 0 minutes at top of grid', () => {
    expect(pxToMinutesSnapped(0, offsets, heights, 15)).toBe(0);
  });

  it('returns 60 minutes at 40px (slot 2 boundary)', () => {
    expect(pxToMinutesSnapped(40, offsets, heights, 15)).toBe(60);
  });

  it('snaps 23px (≈34min) to 30min with 15min snap', () => {
    expect(pxToMinutesSnapped(23, offsets, heights, 15)).toBe(30);
  });

  it('snaps 27px (≈40min) to 45min with 15min snap', () => {
    expect(pxToMinutesSnapped(27, offsets, heights, 15)).toBe(45);
  });

  it('clamps to 24*60 - snap so a dragged event never overflows the grid', () => {
    expect(pxToMinutesSnapped(99999, offsets, heights, 15)).toBe(24 * 60 - 15);
  });

  it('clamps negative px to 0', () => {
    expect(pxToMinutesSnapped(-50, offsets, heights, 15)).toBe(0);
  });
});

describe('applyDeltaMinutes', () => {
  it('shifts both starts_at and ends_at by deltaMinutes', () => {
    const start = new Date(2026, 4, 3, 10, 0).toISOString();
    const end = new Date(2026, 4, 3, 11, 0).toISOString();
    const out = applyDeltaMinutes({ starts_at: start, ends_at: end }, 30);
    expect(new Date(out.starts_at).getHours()).toBe(10);
    expect(new Date(out.starts_at).getMinutes()).toBe(30);
    expect(new Date(out.ends_at!).getHours()).toBe(11);
    expect(new Date(out.ends_at!).getMinutes()).toBe(30);
  });

  it('shifts to a different day when delta crosses midnight', () => {
    const start = new Date(2026, 4, 3, 23, 0).toISOString();
    const end = new Date(2026, 4, 4, 0, 0).toISOString();
    const out = applyDeltaMinutes({ starts_at: start, ends_at: end }, 120);
    expect(new Date(out.starts_at).getDate()).toBe(4);
  });

  it('preserves null ends_at', () => {
    const start = new Date(2026, 4, 3, 10, 0).toISOString();
    const out = applyDeltaMinutes({ starts_at: start, ends_at: null }, 30);
    expect(out.ends_at).toBeNull();
  });

  it('supports negative delta (drag earlier)', () => {
    const start = new Date(2026, 4, 3, 10, 0).toISOString();
    const end = new Date(2026, 4, 3, 11, 0).toISOString();
    const out = applyDeltaMinutes({ starts_at: start, ends_at: end }, -45);
    expect(new Date(out.starts_at).getHours()).toBe(9);
    expect(new Date(out.starts_at).getMinutes()).toBe(15);
  });
});
