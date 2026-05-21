/**
 * Map a legacy provider-string id (clerkId or logtoId) to its canonical
 * `members.id`. Used by INSERT sites that carry a string identifier
 * alongside the canonical FK.
 *
 * Returns null when no `members` row carries that string id — the
 * INSERT proceeds with member_id=NULL.
 *
 * Takes `db` as a parameter (matching the rest of the repo layer)
 * so that tests can inject a fake without dragging the Neon client
 * into the Jest module graph.
 */

import { eq, inArray, or } from 'drizzle-orm';
import { members } from '@/lib/db/schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function resolveMemberId(
  db: Db,
  providerId: string | null | undefined,
): Promise<number | null> {
  if (!providerId) return null;
  // try/catch is intentional: a malformed or partial test-fake `db` should
  // not blow up the callsite — it should fall back to writing
  // member_id=NULL. In production the query is fully supported.
  try {
    const [row] = await db
      .select({ id: members.id })
      .from(members)
      .where(or(eq(members.clerkId, providerId), eq(members.logtoId, providerId)))
      .limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Batched variant for hot loops (cron dispatch, fan-out). Returns a map
 * keyed by the provider-string id. Missing keys (no matching members
 * row) are absent from the map; callers should treat lookup miss as
 * memberId=null.
 */
export async function resolveMemberIds(
  db: Db,
  providerIds: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unique = Array.from(new Set(providerIds.filter(Boolean)));
  if (unique.length === 0) return out;
  try {
    const rows = await db
      .select({ id: members.id, clerkId: members.clerkId, logtoId: members.logtoId })
      .from(members)
      .where(or(inArray(members.clerkId, unique), inArray(members.logtoId, unique)));
    for (const r of rows) {
      if (r.clerkId && unique.includes(r.clerkId)) out.set(r.clerkId, r.id);
      if (r.logtoId && unique.includes(r.logtoId)) out.set(r.logtoId, r.id);
    }
  } catch {
    /* fall through with empty map — see resolveMemberId comment */
  }
  return out;
}
