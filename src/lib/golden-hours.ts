/**
 * Fisheye layout with 30-minute slots (48 slots per day).
 * Rows near viewport center expand, edges shrink.
 */

export const SLOTS_PER_DAY = 48; // 30-min slots
export const SLOT_MINUTES = 30;

const BASE_HEIGHT = 32;    // Minimum slot height at edges
const MAX_HEIGHT = 50;     // Maximum slot height at center
const FISHEYE_SIGMA = 6;   // How many slots the fisheye spans

/**
 * Compute uniform slot heights.
 */
export function computeHourHeights(_totalHeight: number): number[] {
  return Array.from({ length: SLOTS_PER_DAY }, () => BASE_HEIGHT);
}

/**
 * Compute fisheye slot heights based on which slot is at the viewport center.
 * @param centerSlot - fractional slot index at viewport center (e.g., 25 = 12:30 PM)
 */
export function computeFisheyeHeights(centerSlot: number): number[] {
  return Array.from({ length: SLOTS_PER_DAY }, (_, slot) => {
    const dist = Math.abs(slot - centerSlot);
    const gaussian = Math.exp(-(dist * dist) / (2 * FISHEYE_SIGMA * FISHEYE_SIGMA));
    return Math.round(BASE_HEIGHT + gaussian * (MAX_HEIGHT - BASE_HEIGHT));
  });
}

/** Cumulative top offsets for each slot */
export function computeHourOffsets(heights: number[]): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < heights.length - 1; i++) {
    offsets.push(offsets[i] + heights[i]);
  }
  return offsets;
}
