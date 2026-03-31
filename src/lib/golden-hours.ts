/**
 * Golden hour layout — smooth gaussian expansion of working hours.
 *
 * Uses a bell curve centered on 14:00 (2 PM) with a wide spread so
 * the transition from expanded to compressed is gradual and organic.
 * No hard cutoffs — every hour blends smoothly into the next.
 */

const CENTER = 14;   // Peak of the bell curve (2 PM)
const SIGMA = 5.5;   // Width — controls how gradually it tapers
const MIN_WEIGHT = 0.3; // Floor so off-hours never fully vanish
const MAX_WEIGHT = 3.0; // Cap so peak hours don't dominate too much

function hourWeight(hour: number): number {
  // Gaussian: e^(-(x-center)^2 / (2*sigma^2))
  const dist = hour - CENTER;
  const gaussian = Math.exp(-(dist * dist) / (2 * SIGMA * SIGMA));
  // Scale from [0,1] gaussian to [MIN_WEIGHT, MAX_WEIGHT]
  return MIN_WEIGHT + gaussian * (MAX_WEIGHT - MIN_WEIGHT);
}

export function computeHourHeights(totalHeight: number): number[] {
  const weights = Array.from({ length: 24 }, (_, i) => hourWeight(i));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const unit = totalHeight / totalWeight;

  const raw = weights.map(w => w * unit);

  // Floor and distribute remainder
  const floored = raw.map(h => Math.floor(h));
  let remainder = totalHeight - floored.reduce((s, h) => s + h, 0);

  const indices = Array.from({ length: 24 }, (_, i) => i)
    .sort((a, b) => (raw[b] - floored[b]) - (raw[a] - floored[a]));

  for (const i of indices) {
    if (remainder <= 0) break;
    floored[i]++;
    remainder--;
  }

  return floored;
}

/** Cumulative top offsets for each hour */
export function computeHourOffsets(heights: number[]): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < heights.length - 1; i++) {
    offsets.push(offsets[i] + heights[i]);
  }
  return offsets;
}
