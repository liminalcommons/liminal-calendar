/**
 * bookable_windows repo — Task 3 of Plan 3 (1:1 Booking).
 *
 * Pure schema + helpers. Reads filter on `ownerMemberId` (canonical
 * integer FK to members.id). Writers must dual-write `ownerId` (legacy
 * text column) until Phase 4.
 *
 * detectOverlap is pure (no DB) so it can be exercised by unit tests
 * and reused from any future repair/import path.
 */

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookableWindows } from '@/lib/db/schema';

export const WindowInput = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(1).max(1440),
    timezone: z.string().min(1),
  })
  .refine((w) => w.endMinute > w.startMinute, {
    message: 'endMinute must be > startMinute',
  });

export type WindowInputT = z.infer<typeof WindowInput>;

export function detectOverlap(windows: WindowInputT[]): boolean {
  const byDay = new Map<number, WindowInputT[]>();
  for (const w of windows) {
    const arr = byDay.get(w.dayOfWeek) ?? [];
    arr.push(w);
    byDay.set(w.dayOfWeek, arr);
  }
  for (const arr of byDay.values()) {
    arr.sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].startMinute < arr[i - 1].endMinute) return true;
    }
  }
  return false;
}

export async function listMyWindows(memberId: number) {
  return db
    .select()
    .from(bookableWindows)
    .where(eq(bookableWindows.ownerMemberId, memberId));
}

/**
 * Replace-set semantics: deletes all existing windows for this member,
 * then inserts the new set.
 *
 * NOTE: neon-http does not support db.transaction (see commit bec2014 in
 * setEventInvitations). The delete + insert are sequential and
 * non-atomic. This is an accepted project-wide constraint.
 */
export async function replaceMyWindows(
  memberId: number,
  legacyOwnerId: string,
  windows: WindowInputT[],
) {
  await db.delete(bookableWindows).where(eq(bookableWindows.ownerMemberId, memberId));
  if (windows.length > 0) {
    await db.insert(bookableWindows).values(
      windows.map((w) => ({
        ownerId: legacyOwnerId,
        ownerMemberId: memberId,
        dayOfWeek: w.dayOfWeek,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
        timezone: w.timezone,
      })),
    );
  }
}
