import { pxToMinutesSnapped, applyDeltaMinutes, computeDropPatch } from '@/lib/drag-reschedule';

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

describe('computeDropPatch', () => {
  // 48 slots × 20px = 24h; 1px = 1.5 min
  const heights = new Array(48).fill(20);
  const offsets = new Array(48).fill(0).map((_, i) => i * 20);
  const start = new Date(2026, 4, 3, 10, 0).toISOString(); // 600 min = px 400
  const end = new Date(2026, 4, 3, 11, 0).toISOString();   // 660 min = px 440

  it('returns identity when finalY equals originalY', () => {
    const out = computeDropPatch({
      starts_at: start, ends_at: end,
      originalTopPx: 400, finalTopPx: 400,
      hourOffsets: offsets, hourHeights: heights, snap: 15,
    });
    expect(new Date(out.starts_at).getHours()).toBe(10);
    expect(new Date(out.starts_at).getMinutes()).toBe(0);
  });

  it('shifts the event 60min later when finalY is 40px below originalY', () => {
    const out = computeDropPatch({
      starts_at: start, ends_at: end,
      originalTopPx: 400, finalTopPx: 440,
      hourOffsets: offsets, hourHeights: heights, snap: 15,
    });
    expect(new Date(out.starts_at).getHours()).toBe(11);
    expect(new Date(out.ends_at!).getHours()).toBe(12);
  });

  it('shifts the event earlier when finalY is above originalY', () => {
    const out = computeDropPatch({
      starts_at: start, ends_at: end,
      originalTopPx: 400, finalTopPx: 380, // 20px earlier ≈ 30 min earlier
      hourOffsets: offsets, hourHeights: heights, snap: 15,
    });
    expect(new Date(out.starts_at).getHours()).toBe(9);
    expect(new Date(out.starts_at).getMinutes()).toBe(30);
  });

  it('snaps the delta to the grain', () => {
    // originalTopPx=400 (10:00), finalTopPx=403 (≈10:04.5 → snaps to 10:00 with 15min)
    const out = computeDropPatch({
      starts_at: start, ends_at: end,
      originalTopPx: 400, finalTopPx: 403,
      hourOffsets: offsets, hourHeights: heights, snap: 15,
    });
    // delta = 0 → identity
    expect(new Date(out.starts_at).getHours()).toBe(10);
    expect(new Date(out.starts_at).getMinutes()).toBe(0);
  });

  it('preserves null ends_at', () => {
    const out = computeDropPatch({
      starts_at: start, ends_at: null,
      originalTopPx: 400, finalTopPx: 440,
      hourOffsets: offsets, hourHeights: heights, snap: 15,
    });
    expect(out.ends_at).toBeNull();
    expect(new Date(out.starts_at).getHours()).toBe(11);
  });
});
