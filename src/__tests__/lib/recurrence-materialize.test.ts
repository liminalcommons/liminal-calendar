import { filterNewOccurrences } from '@/lib/recurrence-materialize';

function occ(iso: string) {
  return { startTime: new Date(iso), endTime: new Date(iso) };
}

describe('filterNewOccurrences', () => {
  const all = [
    occ('2026-04-20T10:00:00Z'),
    occ('2026-04-21T10:00:00Z'),
    occ('2026-04-22T10:00:00Z'),
  ];

  it('returns all occurrences when lastMaterialized is null', () => {
    expect(filterNewOccurrences(all, null)).toEqual(all);
  });

  it('returns all occurrences when lastMaterialized is undefined', () => {
    expect(filterNewOccurrences(all, undefined)).toEqual(all);
  });

  it('drops occurrences strictly at-or-before lastMaterialized (strict >)', () => {
    const filtered = filterNewOccurrences(all, '2026-04-21T10:00:00Z');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].startTime.toISOString()).toBe('2026-04-22T10:00:00.000Z');
  });

  it('accepts lastMaterialized as a Date instance', () => {
    const filtered = filterNewOccurrences(all, new Date('2026-04-21T10:00:00Z'));
    expect(filtered).toHaveLength(1);
  });

  it('ignores an invalid lastMaterialized string (falls back to all)', () => {
    expect(filterNewOccurrences(all, 'not-a-date')).toEqual(all);
  });

  it('returns empty when lastMaterialized is after every occurrence', () => {
    expect(filterNewOccurrences(all, '2030-01-01T00:00:00Z')).toEqual([]);
  });
});
