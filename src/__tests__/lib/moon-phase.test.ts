import {
  getMoonPhase,
  getMoonPhaseName,
  getMoonPhaseEmoji,
  MOON_PHASE_NAMES,
  MOON_PHASE_EMOJIS,
} from '../../lib/moon-phase';

describe('getMoonPhase', () => {
  it('returns a value between 0 and 7 inclusive', () => {
    const dates = [
      new Date('2026-01-01'),
      new Date('2026-03-15'),
      new Date('2026-06-21'),
      new Date('2026-09-07'),
      new Date('2026-12-31'),
    ];
    for (const date of dates) {
      const phase = getMoonPhase(date);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThanOrEqual(7);
    }
  });

  it('returns an integer', () => {
    const phase = getMoonPhase(new Date('2026-03-28'));
    expect(Number.isInteger(phase)).toBe(true);
  });

  it('returns 0 for a known new moon date (approx Jan 6, 2000)', () => {
    // Known new moon reference date used in the algorithm
    const phase = getMoonPhase(new Date(2000, 0, 6)); // Jan 6, 2000
    // Should be 0 or very close — allow 0 or 1 due to rounding
    expect(phase).toBeLessThanOrEqual(1);
  });
});

describe('getMoonPhaseName', () => {
  it('returns a valid name for each phase 0-7', () => {
    for (let i = 0; i <= 7; i++) {
      const name = getMoonPhaseName(i);
      expect(MOON_PHASE_NAMES).toContain(name as any);
    }
  });

  it('returns "New Moon" for phase 0', () => {
    expect(getMoonPhaseName(0)).toBe('New Moon');
  });

  it('returns "Full Moon" for phase 4', () => {
    expect(getMoonPhaseName(4)).toBe('Full Moon');
  });

  it('returns "Waxing Crescent" for phase 1', () => {
    expect(getMoonPhaseName(1)).toBe('Waxing Crescent');
  });

  it('wraps at 8 via modulo', () => {
    expect(getMoonPhaseName(8)).toBe(getMoonPhaseName(0));
  });
});

describe('getMoonPhaseEmoji', () => {
  it('returns a string for each phase 0-7', () => {
    for (let i = 0; i <= 7; i++) {
      const emoji = getMoonPhaseEmoji(i);
      expect(typeof emoji).toBe('string');
      expect(emoji.length).toBeGreaterThan(0);
    }
  });

  it('returns 🌑 for New Moon (phase 0)', () => {
    expect(getMoonPhaseEmoji(0)).toBe('🌑');
  });

  it('returns 🌕 for Full Moon (phase 4)', () => {
    expect(getMoonPhaseEmoji(4)).toBe('🌕');
  });

  it('all 8 emojis are distinct', () => {
    const emojis = Array.from({ length: 8 }, (_, i) => getMoonPhaseEmoji(i));
    const unique = new Set(emojis);
    expect(unique.size).toBe(8);
  });

  it('wraps at 8 via modulo', () => {
    expect(getMoonPhaseEmoji(8)).toBe(getMoonPhaseEmoji(0));
  });
});
