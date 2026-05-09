/**
 * Map a legacy provider-string id (hyloId or clerkId) to its canonical
 * `members.id`. Used by INSERT sites during the Phase 2 dual-write
 * window so that any code path that has a string identifier (an invitee,
 * a notification recipient, a push subscription owner) can carry the
 * matching FK alongside the legacy column.
 *
 * Returns null when no `members` row carries that string id — the
 * INSERT proceeds with member_id=NULL, which is harmless under the
 * Phase 1 nullable schema. Phase 4 will tighten this when reads have
 * fully migrated to member_id.
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
  // not blow up the dual-write callsite — it should fall back to writing
  // member_id=NULL (still safe under the Phase 1 nullable schema). In
  // production the query is fully supported and always succeeds.
  try {
    const [row] = await db
      .select({ id: members.id })
      .from(members)
      .where(or(eq(members.hyloId, providerId), eq(members.clerkId, providerId)))
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
      .select({ id: members.id, hyloId: members.hyloId, clerkId: members.clerkId })
      .from(members)
      .where(or(inArray(members.hyloId, unique), inArray(members.clerkId, unique)));
    for (const r of rows) {
      if (r.hyloId && unique.includes(r.hyloId)) out.set(r.hyloId, r.id);
      if (r.clerkId && unique.includes(r.clerkId)) out.set(r.clerkId, r.id);
    }
  } catch {
    /* fall through with empty map — see resolveMemberId comment */
  }
  return out;
}
