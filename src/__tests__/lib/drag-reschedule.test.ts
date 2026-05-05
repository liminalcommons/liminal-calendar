import {
  pxToMinutesSnapped,
  applyDeltaMinutes,
  computeDropPatch,
  minutesToPx,
  computeSnappedDeltaPx,
  computeCrossDayDropTimes,
} from '@/lib/drag-reschedule';

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

describe('minutesToPx', () => {
  // each 30-min slot is 20px; 48 slots cover the day
  const heights = new Array(48).fill(20);
  const offsets = new Array(48).fill(0).map((_, i) => i * 20);

  it('returns slot top px at slot boundary', () => {
    expect(minutesToPx(60, offsets, heights)).toBe(40); // 1:00am at 40px
  });

  it('interpolates within a slot', () => {
    expect(minutesToPx(75, offsets, heights)).toBe(50); // 1:15am halfway through slot 2
  });

  it('clamps high minutes to last slot', () => {
    // last slot starts at offset 47*20=940; 23:30 (1410min) lands at slot 47 frac=0
    expect(minutesToPx(1410, offsets, heights)).toBe(940);
  });
});

describe('computeSnappedDeltaPx', () => {
  // each 30-min slot is 20px; 15-min snap step = 10px
  const heights = new Array(48).fill(20);
  const offsets = new Array(48).fill(0).map((_, i) => i * 20);

  it('returns 0 when raw delta is below half a snap step', () => {
    // originalTopPx=400 (10:00am), drag +4px (~6 min) → snaps to 10:00 → 0
    const out = computeSnappedDeltaPx({
      originalTopPx: 400, rawDeltaPx: 4,
      hourOffsets: offsets, hourHeights: heights, snap: 15,
    });
    expect(out).toBe(0);
  });

  it('jumps one snap step (10px) once the raw delta crosses 7.5min worth', () => {
    // originalTopPx=400 (10:00am), drag +8px (~12 min) → snaps to 10:15 → +10px
    const out = computeSnappedDeltaPx({
      originalTopPx: 400, rawDeltaPx: 8,
      hourOffsets: offsets, hourHeights: heights, snap: 15,
    });
    expect(out).toBe(10);
  });

  it('jumps backward in snap steps for upward drag', () => {
    // originalTopPx=400 (10:00am), drag -10px (~-15 min) → snaps to 9:45 → -10px
    const out = computeSnappedDeltaPx({
      originalTopPx: 400, rawDeltaPx: -10,
      hourOffsets: offsets, hourHeights: heights, snap: 15,
    });
    expect(out).toBe(-10);
  });

  it('handles non-snap-aligned originalTopPx (event starts mid-slot)', () => {
    // originalTopPx=403 (≈10:04.5, snaps to 10:00), drag +30px → final px 433
    // (≈10:49.5, snaps to 10:45). Snapped target px = 430. Delta = 430 - 403 = 27.
    const out = computeSnappedDeltaPx({
      originalTopPx: 403, rawDeltaPx: 30,
      hourOffsets: offsets, hourHeights: heights, snap: 15,
    });
    expect(out).toBe(27);
  });
});

describe('computeCrossDayDropTimes', () => {
  // each 30-min slot is 20px; 15-min snap step = 10px
  const heights = new Array(48).fill(20);
  const offsets = new Array(48).fill(0).map((_, i) => i * 20);

  it('returns the snapped time on the destination day, preserving duration', () => {
    // Original event Mon 10:00–11:00. Drop at Wed 14:00 (slot 28 top = 560px).
    const origStart = new Date(2026, 4, 4, 10, 0).toISOString();   // Mon May 4 10:00
    const origEnd = new Date(2026, 4, 4, 11, 0).toISOString();     // Mon May 4 11:00
    const wedMidnight = new Date(2026, 4, 6, 0, 0);                // Wed May 6
    const out = computeCrossDayDropTimes({
      blockTopYInColumn: 560, // 14:00
      destDayMidnight: wedMidnight,
      originalStartIso: origStart,
      originalEndIso: origEnd,
      hourOffsets: offsets,
      hourHeights: heights,
      snap: 15,
    });
    const ns = new Date(out.starts_at);
    expect(ns.getDate()).toBe(6);    // Wed
    expect(ns.getHours()).toBe(14);
    expect(ns.getMinutes()).toBe(0);
    const ne = new Date(out.ends_at!);
    expect(ne.getHours()).toBe(15);  // 1hr duration preserved
    expect(out.snappedTopPx).toBe(560);
    expect(out.snappedHeightPx).toBe(40); // 1hr = 2 slots × 20px
  });

  it('snaps a non-aligned blockTopY to the nearest 15-min row', () => {
    const origStart = new Date(2026, 4, 4, 10, 0).toISOString();
    const wedMidnight = new Date(2026, 4, 6, 0, 0);
    const out = computeCrossDayDropTimes({
      blockTopYInColumn: 567, // ~14:10.5 → snaps to 14:15 (slot 28 + half)
      destDayMidnight: wedMidnight,
      originalStartIso: origStart,
      originalEndIso: null,
      hourOffsets: offsets,
      hourHeights: heights,
      snap: 15,
    });
    const ns = new Date(out.starts_at);
    expect(ns.getHours()).toBe(14);
    expect(ns.getMinutes()).toBe(15);
    expect(out.ends_at).toBeNull();
  });

  it('clamps the snapped minutes inside the day', () => {
    const origStart = new Date(2026, 4, 4, 10, 0).toISOString();
    const wedMidnight = new Date(2026, 4, 6, 0, 0);
    const out = computeCrossDayDropTimes({
      blockTopYInColumn: 999999, // way past end of day
      destDayMidnight: wedMidnight,
      originalStartIso: origStart,
      originalEndIso: null,
      hourOffsets: offsets,
      hourHeights: heights,
      snap: 15,
    });
    const ns = new Date(out.starts_at);
    // pxToMinutesSnapped clamps to 24*60 - snap = 1425 min = 23:45
    expect(ns.getHours()).toBe(23);
    expect(ns.getMinutes()).toBe(45);
  });
});
