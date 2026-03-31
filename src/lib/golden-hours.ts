/**
 * Golden hour layout — expand working hours, compress off-hours.
 *
 * Returns an array of 24 pixel heights that sum to `totalHeight`.
 * Hours near the "golden" range get more space; late night / early morning get compressed.
 */

/** Weight per hour — higher = more vertical space */
function hourWeight(hour: number): number {
  // Golden hours: 8am–8pm (peak activity)
  if (hour >= 8 && hour <= 20) return 3;
  // Shoulder hours: 6–7am, 9–10pm
  if (hour >= 6 && hour <= 7) return 1.8;
  if (hour >= 21 && hour <= 22) return 1.8;
  // Off-hours: 11pm–5am
  return 0.5;
}

export function computeHourHeights(totalHeight: number): number[] {
  const weights = Array.from({ length: 24 }, (_, i) => hourWeight(i));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const unit = totalHeight / totalWeight;

  // Compute raw heights
  const raw = weights.map(w => w * unit);

  // Floor everything and distribute remainder pixel by pixel
  const floored = raw.map(h => Math.floor(h));
  let remainder = totalHeight - floored.reduce((s, h) => s + h, 0);

  // Give leftover pixels to the golden hours first
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
