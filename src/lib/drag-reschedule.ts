/**
 * Pure helpers for drag-to-reschedule on the weekly grid.
 *
 * `pxToMinutesSnapped` translates a vertical pixel coordinate within a day
 * column into a minutes-since-midnight value snapped to the user's chosen
 * grain (default 15min in the spec). The grid uses non-uniform slot heights
 * (golden-hour fisheye), so the conversion has to walk `hourOffsets` to find
 * the correct 30-min slot, then interpolate within it.
 *
 * `applyDeltaMinutes` shifts a (starts_at, ends_at) pair by N minutes,
 * preserving the duration. Used after a drop to compute the new times.
 */

export function pxToMinutesSnapped(
  px: number,
  hourOffsets: number[],
  hourHeights: number[],
  snap: number,
): number {
  if (px <= 0) return 0;
  let slot = hourOffsets.length - 1;
  for (let i = 0; i < hourOffsets.length; i++) {
    if (hourOffsets[i] > px) {
      slot = Math.max(0, i - 1);
      break;
    }
  }
  const slotTop = hourOffsets[slot];
  const slotH = hourHeights[slot];
  const frac = slotH > 0 ? Math.min(1, Math.max(0, (px - slotTop) / slotH)) : 0;
  const rawMinutes = slot * 30 + frac * 30;
  const snapped = Math.round(rawMinutes / snap) * snap;
  return Math.min(24 * 60 - snap, Math.max(0, snapped));
}

/**
 * Inverse of `pxToMinutesSnapped`'s slot lookup: convert a minutes-since-midnight
 * value back to the corresponding pixel offset within the day column. Used by
 * the drag preview to compute the snapped target Y so the dragging block
 * visually lands on each 15-min slot as the user moves.
 */
export function minutesToPx(
  minutes: number,
  hourOffsets: number[],
  hourHeights: number[],
): number {
  const slot = Math.min(Math.max(0, Math.floor(minutes / 30)), hourOffsets.length - 1);
  const frac = (minutes - slot * 30) / 30;
  return hourOffsets[slot] + frac * hourHeights[slot];
}

/**
 * Live drag preview: given the block's true rendered top px and the cursor's
 * raw vertical delta since pointerdown, return the *snapped* translateY value
 * the block should display. Translation is 0 until the cursor crosses the
 * nearest 15-min boundary; after that the block jumps in 15-min increments
 * (matching the eventual snapped drop).
 */
export function computeSnappedDeltaPx(args: {
  originalTopPx: number;
  rawDeltaPx: number;
  hourOffsets: number[];
  hourHeights: number[];
  snap: number;
}): number {
  const targetPx = args.originalTopPx + args.rawDeltaPx;
  const snappedMinutes = pxToMinutesSnapped(targetPx, args.hourOffsets, args.hourHeights, args.snap);
  const snappedTargetPx = minutesToPx(snappedMinutes, args.hourOffsets, args.hourHeights);
  return snappedTargetPx - args.originalTopPx;
}

export function applyDeltaMinutes<T extends { starts_at: string; ends_at: string | null }>(
  ev: T,
  deltaMinutes: number,
): { starts_at: string; ends_at: string | null } {
  const start = new Date(ev.starts_at);
  const newStart = new Date(start.getTime() + deltaMinutes * 60_000);
  if (!ev.ends_at) return { starts_at: newStart.toISOString(), ends_at: null };
  const end = new Date(ev.ends_at);
  const newEnd = new Date(end.getTime() + deltaMinutes * 60_000);
  return { starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() };
}

/**
 * Compose a PATCH payload from a drop event. Maps the original block's top
 * pixel and the drop's final pixel through `pxToMinutesSnapped` (so both ends
 * of the drag respect the fisheye + grain), takes the difference, and shifts
 * the event by that delta. Same-pixel drops produce the identity (no PATCH
 * worth sending — caller can compare and skip).
 */
export function computeDropPatch(args: {
  starts_at: string;
  ends_at: string | null;
  originalTopPx: number;
  finalTopPx: number;
  hourOffsets: number[];
  hourHeights: number[];
  snap: number;
}): { starts_at: string; ends_at: string | null } {
  const { starts_at, ends_at, originalTopPx, finalTopPx, hourOffsets, hourHeights, snap } = args;
  const originalMinutes = pxToMinutesSnapped(originalTopPx, hourOffsets, hourHeights, snap);
  const newMinutes = pxToMinutesSnapped(finalTopPx, hourOffsets, hourHeights, snap);
  const delta = newMinutes - originalMinutes;
  return applyDeltaMinutes({ starts_at, ends_at }, delta);
}
