import { computeOverlapLayout } from '../../components/calendar/overlap';

describe('computeOverlapLayout', () => {
  it('single event → colIndex 0, colTotal 1', () => {
    const result = computeOverlapLayout([
      { id: 'a', startMinutes: 60, endMinutes: 120 },
    ]);
    expect(result.get('a')).toEqual({ colIndex: 0, colTotal: 1 });
  });

  it('non-overlapping events → each gets colTotal 1', () => {
    const result = computeOverlapLayout([
      { id: 'a', startMinutes: 60, endMinutes: 120 },
      { id: 'b', startMinutes: 180, endMinutes: 240 },
      { id: 'c', startMinutes: 300, endMinutes: 360 },
    ]);
    expect(result.get('a')).toEqual({ colIndex: 0, colTotal: 1 });
    expect(result.get('b')).toEqual({ colIndex: 0, colTotal: 1 });
    expect(result.get('c')).toEqual({ colIndex: 0, colTotal: 1 });
  });

  it('touching edges are NOT considered overlap', () => {
    // event a ends exactly when b starts — not an overlap
    const result = computeOverlapLayout([
      { id: 'a', startMinutes: 60, endMinutes: 120 },
      { id: 'b', startMinutes: 120, endMinutes: 180 },
    ]);
    expect(result.get('a')).toEqual({ colIndex: 0, colTotal: 1 });
    expect(result.get('b')).toEqual({ colIndex: 0, colTotal: 1 });
  });

  it('two overlapping events → different columns, colTotal 2', () => {
    const result = computeOverlapLayout([
      { id: 'a', startMinutes: 60, endMinutes: 150 },
      { id: 'b', startMinutes: 90, endMinutes: 180 },
    ]);
    const a = result.get('a')!;
    const b = result.get('b')!;

    // They must be in different columns
    expect(a.colIndex).not.toBe(b.colIndex);
    // Both should report colTotal 2
    expect(a.colTotal).toBe(2);
    expect(b.colTotal).toBe(2);
  });

  it('three overlapping events → colTotal 3', () => {
    const result = computeOverlapLayout([
      { id: 'a', startMinutes: 60, endMinutes: 240 },
      { id: 'b', startMinutes: 60, endMinutes: 240 },
      { id: 'c', startMinutes: 60, endMinutes: 240 },
    ]);
    const a = result.get('a')!;
    const b = result.get('b')!;
    const c = result.get('c')!;

    // All different columns
    expect(new Set([a.colIndex, b.colIndex, c.colIndex]).size).toBe(3);
    // All report colTotal 3
    expect(a.colTotal).toBe(3);
    expect(b.colTotal).toBe(3);
    expect(c.colTotal).toBe(3);
  });

  it('empty input returns empty map', () => {
    const result = computeOverlapLayout([]);
    expect(result.size).toBe(0);
  });

  it('partially overlapping cluster — non-overlapping pair uses only its own colTotal', () => {
    // a and b overlap; c overlaps b but not a
    // a: 60-120, b: 90-150, c: 130-200
    const result = computeOverlapLayout([
      { id: 'a', startMinutes: 60, endMinutes: 120 },
      { id: 'b', startMinutes: 90, endMinutes: 150 },
      { id: 'c', startMinutes: 130, endMinutes: 200 },
    ]);
    const a = result.get('a')!;
    const b = result.get('b')!;
    const c = result.get('c')!;

    // a and b overlap → colTotal 2 each
    expect(a.colTotal).toBe(2);
    expect(b.colTotal).toBe(2);
    // c only overlaps b → colTotal 2
    expect(c.colTotal).toBe(2);
  });
});
