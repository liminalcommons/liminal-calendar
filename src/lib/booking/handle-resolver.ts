/**
 * Resolve a member handle (case-insensitive) to the integer
 * `members.id` primary key.
 *
 * Task 1 of Plan 3 (1:1 Booking). Used by booking links (`/book/:handle`)
 * to look up the host record from a URL slug. Returns `members.id`
 * (the internal PK), NOT a provider-string id — booking entities are
 * joined on members.id so that hyloId/clerkId/logtoId can be
 * canonicalized later without touching booking rows.
 *
 * Returns null for empty input (cheap fast-path) or when no row
 * matches. Lowercase comparison is done in SQL so the unique-index
 * (`handle`) remains usable: `lower(handle) = lower(:input)`.
 */

import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function resolveHandleToMemberId(handle: string): Promise<number | null> {
  if (!handle) return null;
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(sql`lower(${members.handle})`, handle.toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}
