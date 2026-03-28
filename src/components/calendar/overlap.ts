/**
 * overlap.ts — Pure event overlap layout algorithm.
 * No React dependencies. Given events with start/end in minutes,
 * computes colIndex and colTotal for absolute positioning in the grid.
 */

export interface OverlapResult {
  colIndex: number;
  colTotal: number;
}

interface EventSlot {
  id: string;
  startMinutes: number;
  endMinutes: number;
}

/**
 * Determine if two events overlap (share any time window).
 * Touching edges (end === start) are NOT considered overlap.
 */
function overlaps(a: EventSlot, b: EventSlot): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/**
 * Compute overlap layout for a list of events.
 *
 * Algorithm:
 *   1. Sort by start time; on tie, longer duration first.
 *   2. Greedy column assignment — place each event in the first column
 *      where it doesn't overlap with any existing occupant.
 *   3. For each event, set colTotal = max column index among all overlapping
 *      events (including itself) + 1.
 */
export function computeOverlapLayout(
  events: Array<{ id: string; startMinutes: number; endMinutes: number }>
): Map<string, OverlapResult> {
  if (events.length === 0) return new Map();

  // 1. Sort: earlier start first; on tie, longer duration first
  const sorted = [...events].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    const durA = a.endMinutes - a.startMinutes;
    const durB = b.endMinutes - b.startMinutes;
    return durB - durA;
  });

  // 2. Greedy column assignment
  // columns[colIdx] = array of events placed in that column
  const columns: EventSlot[][] = [];

  const colAssignment = new Map<string, number>();

  for (const event of sorted) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const hasConflict = columns[col].some(existing => overlaps(existing, event));
      if (!hasConflict) {
        columns[col].push(event);
        colAssignment.set(event.id, col);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([event]);
      colAssignment.set(event.id, columns.length - 1);
    }
  }

  // 3. For each event, find the max column index among all overlapping events
  // to determine colTotal
  const result = new Map<string, OverlapResult>();

  for (const event of sorted) {
    const myCol = colAssignment.get(event.id)!;
    let maxCol = myCol;

    for (const other of sorted) {
      if (other.id !== event.id && overlaps(event, other)) {
        const otherCol = colAssignment.get(other.id)!;
        if (otherCol > maxCol) maxCol = otherCol;
      }
    }

    result.set(event.id, {
      colIndex: myCol,
      colTotal: maxCol + 1,
    });
  }

  return result;
}
