/**
 * Moon phase utilities using Conway's algorithm.
 * Returns phase 0-7 where 0=New Moon, 4=Full Moon.
 */

export function getMoonPhase(date: Date): number {
  let year = date.getFullYear();
  let month = date.getMonth() + 1; // 1-based
  const day = date.getDate();

  if (month < 3) {
    year--;
    month += 12;
  }

  const a = Math.floor(year / 100);
  const b = Math.floor(a / 4);
  const c = 2 - a + b;
  const e = Math.floor(365.25 * (year + 4716));
  const f = Math.floor(30.6001 * (month + 1));
  const jd = c + day + e + f - 1524.5;

  // Days since known new moon (Jan 6, 2000)
  const daysSinceNew = jd - 2451549.5;
  const newMoons = daysSinceNew / 29.53058867;
  const phase = newMoons - Math.floor(newMoons); // 0..1

  // Map to 0-7
  return Math.round(phase * 8) % 8;
}

export const MOON_PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
] as const;

export const MOON_PHASE_EMOJIS = [
  '🌑', // New Moon
  '🌒', // Waxing Crescent
  '🌓', // First Quarter
  '🌔', // Waxing Gibbous
  '🌕', // Full Moon
  '🌖', // Waning Gibbous
  '🌗', // Last Quarter
  '🌘', // Waning Crescent
] as const;

export function getMoonPhaseName(phase: number): string {
  return MOON_PHASE_NAMES[phase % 8];
}

export function getMoonPhaseEmoji(phase: number): string {
  return MOON_PHASE_EMOJIS[phase % 8];
}
