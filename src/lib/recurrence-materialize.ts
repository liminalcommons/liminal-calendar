/**
 * Pure helpers for the /api/cron/materialize route.
 */

export interface Occurrence {
  startTime: Date;
  endTime: Date;
}

/**
 * Drop occurrences whose startTime is not strictly after `lastMaterialized`.
 * If `lastMaterialized` is null/undefined, returns all occurrences unchanged.
 * Strict-after (not >=) is load-bearing: if we re-ran with `>=`, any
 * occurrence exactly at lastMaterialized would be rematerialized and create
 * duplicates in Hylo.
 */
export function filterNewOccurrences<T extends Occurrence>(
  occurrences: T[],
  lastMaterialized: string | Date | null | undefined,
): T[] {
  if (!lastMaterialized) return occurrences;
  const cutoff = lastMaterialized instanceof Date ? lastMaterialized : new Date(lastMaterialized);
  if (Number.isNaN(cutoff.getTime())) return occurrences;
  return occurrences.filter((o) => o.startTime > cutoff);
}
