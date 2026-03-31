/**
 * Uniform hour heights — each row is the same size.
 * The grid scrolls, so we don't need to compress hours to fit the viewport.
 */

const HOUR_HEIGHT = 64; // px — comfortable row height for readability

export function computeHourHeights(_totalHeight: number): number[] {
  return Array.from({ length: 24 }, () => HOUR_HEIGHT);
}

/** Cumulative top offsets for each hour */
export function computeHourOffsets(heights: number[]): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < heights.length - 1; i++) {
    offsets.push(offsets[i] + heights[i]);
  }
  return offsets;
}
