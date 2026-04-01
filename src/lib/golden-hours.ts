/**
 * Fisheye hour layout — rows near viewport center expand, edges shrink.
 * Creates a magnifying-lens feel as you scroll through the day.
 */

const BASE_HEIGHT = 56;   // Minimum row height at edges
const MAX_HEIGHT = 90;     // Maximum row height at center
const FISHEYE_SIGMA = 3;   // How many rows the fisheye spans (in hours)

/**
 * Compute uniform hour heights (used for initial render before scroll kicks in).
 */
export function computeHourHeights(_totalHeight: number): number[] {
  return Array.from({ length: 24 }, () => BASE_HEIGHT);
}

/**
 * Compute fisheye hour heights based on which hour is at the viewport center.
 * @param centerHour - fractional hour at the center of the viewport (e.g., 14.5 = 2:30 PM)
 */
export function computeFisheyeHeights(centerHour: number): number[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const dist = Math.abs(hour - centerHour);
    const gaussian = Math.exp(-(dist * dist) / (2 * FISHEYE_SIGMA * FISHEYE_SIGMA));
    return Math.round(BASE_HEIGHT + gaussian * (MAX_HEIGHT - BASE_HEIGHT));
  });
}

/** Cumulative top offsets for each hour */
export function computeHourOffsets(heights: number[]): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < heights.length - 1; i++) {
    offsets.push(offsets[i] + heights[i]);
  }
  return offsets;
}
