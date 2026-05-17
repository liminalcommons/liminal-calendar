/**
 * Auto-claim a handle for a member whose `handle` is currently null.
 *
 * Strategy: take `suggestHandleFromMember` as the base candidate, then
 * walk `base`, `base-2`, `base-3`, ... up to `base-99` to dodge
 * collisions. On unique-constraint races we move on to the next suffix.
 * Returns the assigned handle, or null if no candidate could be derived.
 *
 * Side-effecting (writes `members.handle`). Caller decides whether to
 * `router.refresh()` after.
 */

import { eq, sql } from 'drizzle-orm';
import { members } from '@/lib/db/schema';
import { suggestHandleFromMember } from './suggest-handle';

interface MemberLike {
  email?: string | null;
  name?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function autoClaimHandle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  memberId: number,
  member: MemberLike,
): Promise<string | null> {
  const base = suggestHandleFromMember(member);
  if (!base) return null;

  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    if (candidate.length > 30) break;

    const [taken] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(sql`lower(${members.handle})`, candidate))
      .limit(1);
    if (taken) continue;

    try {
      await db.update(members).set({ handle: candidate }).where(eq(members.id, memberId));
      return candidate;
    } catch {
      // unique-constraint race — another process won; try next suffix
      continue;
    }
  }
  return null;
}
