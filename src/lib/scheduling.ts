export interface SchedulingSuggestion {
  day: string;           // "Monday", "Tuesday", etc.
  dayIndex: number;      // 0=Mon, 6=Sun
  startSlot: number;     // 0-335
  startTime: string;     // "14:00" UTC
  endTime: string;       // "15:30" UTC
  available: number;
  total: number;
  missing: { name: string; hyloId: string }[];
}

interface MemberAvailability {
  hyloId: string;
  name: string;
  availability: number[]; // UTC slot indices
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function slotToTime(slot: number): string {
  const daySlot = slot % 48;
  const hour = Math.floor(daySlot / 2);
  const min = (daySlot % 2) * 30;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function findBestTimes(
  membersAvail: MemberAvailability[],
  durationMinutes: number,
  maxResults = 5,
): SchedulingSuggestion[] {
  if (membersAvail.length === 0) return [];

  const slotsNeeded = Math.ceil(durationMinutes / 30);
  const total = membersAvail.length;

  // Build a count array: for each of 336 slots, how many members are available
  const counts = new Array(336).fill(0);
  const availSets = membersAvail.map(m => new Set(m.availability));

  for (const avSet of availSets) {
    for (const slot of avSet) {
      if (slot >= 0 && slot < 336) counts[slot]++;
    }
  }

  // Find all valid contiguous windows of length slotsNeeded
  const candidates: { startSlot: number; minCount: number; avgCount: number }[] = [];

  for (let start = 0; start <= 336 - slotsNeeded; start++) {
    // Don't span across day boundaries
    const startDay = Math.floor(start / 48);
    const endDay = Math.floor((start + slotsNeeded - 1) / 48);
    if (startDay !== endDay) continue;

    let minCount = Infinity;
    let sumCount = 0;
    for (let i = 0; i < slotsNeeded; i++) {
      const c = counts[start + i];
      if (c < minCount) minCount = c;
      sumCount += c;
    }

    if (minCount > 0) {
      candidates.push({ startSlot: start, minCount, avgCount: sumCount / slotsNeeded });
    }
  }

  // Sort: highest minCount first, then highest avgCount
  candidates.sort((a, b) => {
    if (b.minCount !== a.minCount) return b.minCount - a.minCount;
    return b.avgCount - a.avgCount;
  });

  // Deduplicate: skip candidates that overlap with already-selected ones
  const selected: typeof candidates = [];
  for (const cand of candidates) {
    const overlaps = selected.some(s =>
      cand.startSlot < s.startSlot + slotsNeeded && cand.startSlot + slotsNeeded > s.startSlot
    );
    if (!overlaps) {
      selected.push(cand);
      if (selected.length >= maxResults) break;
    }
  }

  // Build results
  return selected.map(({ startSlot }) => {
    const dayIndex = Math.floor(startSlot / 48);
    const endSlot = startSlot + slotsNeeded - 1;

    // Find who's missing (not available for ALL slots in the window)
    const missing: { name: string; hyloId: string }[] = [];
    let availCount = 0;
    for (let mi = 0; mi < membersAvail.length; mi++) {
      const avSet = availSets[mi];
      let allAvail = true;
      for (let s = startSlot; s <= endSlot; s++) {
        if (!avSet.has(s)) { allAvail = false; break; }
      }
      if (allAvail) {
        availCount++;
      } else {
        missing.push({ name: membersAvail[mi].name, hyloId: membersAvail[mi].hyloId });
      }
    }

    return {
      day: DAY_NAMES[dayIndex],
      dayIndex,
      startSlot,
      startTime: slotToTime(startSlot),
      endTime: slotToTime(startSlot + slotsNeeded),
      available: availCount,
      total,
      missing,
    };
  });
}
