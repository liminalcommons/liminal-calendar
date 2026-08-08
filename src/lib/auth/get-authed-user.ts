/**
 * Resolve the current request to a unified user shape, accepting either
 * a Castalia (Logto / NextAuth) session or a Clerk session.
 *
 * Returned object always carries the canonical `memberId` (members.id)
 * when it can be resolved — that is the integer FK every person-bearing
 * table points at. When the lookup can't complete (e.g. inside a test
 * using a fake db), `memberId` falls through to null and the legacy
 * provider-string `id` continues to drive behavior.
 */

import { eq } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { auth as nextAuth } from '../../../auth';
import { db } from '@/lib/db';
import { members, type Member } from '@/lib/db/schema';
import { getCurrentMember } from './get-current-member';
import { syncLogtoMemberOnRead } from './sync-logto-member-on-read';
import type { UserRole } from '@/lib/auth-helpers';

export type AuthedUser = {
  /** Canonical integer identity — `members.id`. Null only when no row matched. */
  memberId: number | null;
  id: string;
  role: UserRole;
  name: string | null;
  image: string | null;
  logtoUserId?: string;
  clerkId?: string;
  email?: string | null;
};

function normalizeRole(role: unknown): UserRole {
  return role === 'admin' ? 'admin' : role === 'host' ? 'host' : 'member';
}

/**
 * Canonical member id AND role for a Logto identity.
 *
 * Role comes from the database, not the session claim. The claim is minted
 * when the session is issued and never refreshes, so promoting someone via
 * /admin (which writes members.role) left their token still saying "member".
 * /api/profile reads the table, so the admin page would render for them while
 * every admin API returned 403 — the same shape of bug as a silent failure:
 * working enough to look fine, broken where it counts. The table is the thing
 * the admin UI writes, so the table wins.
 */
async function lookupMemberByLogtoId(
  logtoId: string,
): Promise<{ id: number; role: UserRole } | null> {
  try {
    const [row] = await db
      .select({ id: members.id, role: members.role })
      .from(members)
      .where(eq(members.logtoId, logtoId))
      .limit(1);
    return row ? { id: row.id, role: normalizeRole(row.role) } : null;
  } catch {
    return null;
  }
}

export async function getAuthedUser(): Promise<AuthedUser | null> {
  // Castalia (Logto via NextAuth) path. nextAuth() can throw on a malformed
  // or stale session cookie — catch and fall through to Clerk so a single
  // bad cookie doesn't crash every Server Component render.
  let session: Session | null = null;
  try {
    session = (await nextAuth()) as Session | null;
  } catch (err) {
    console.error('[getAuthedUser] nextAuth() threw:', err instanceof Error ? err.message : String(err));
  }
  if (session?.user) {
    const u = session.user as {
      logtoUserId?: string;
      id?: string;
      role?: string;
      name?: string | null;
      image?: string | null;
      email?: string | null;
    };
    if (u.logtoUserId) {
      let member = await lookupMemberByLogtoId(u.logtoUserId);
      if (member === null) {
        // Provision on read so a fresh Castalia user gets a canonical
        // memberId on their first request instead of memberId:null — which
        // would 401 every API call and bounce protected pages to the landing.
        await syncLogtoMemberOnRead(db, {
          logtoUserId: u.logtoUserId,
          email: u.email ?? null,
          name: u.name ?? null,
        });
        member = await lookupMemberByLogtoId(u.logtoUserId);
      }
      return {
        memberId: member?.id ?? null,
        id: u.logtoUserId,
        // Prefer the stored role; fall back to the session claim only when the
        // row can't be read (fake db in tests, transient DB error), preserving
        // the existing degrade-gracefully behaviour.
        role: member?.role ?? normalizeRole(u.role),
        name: u.name ?? null,
        image: u.image ?? null,
        logtoUserId: u.logtoUserId,
        email: u.email ?? null,
      };
    }
  }

  // Clerk path — getCurrentMember handles defensive provisioning.
  let member: Member | null = null;
  try {
    member = await getCurrentMember(db);
  } catch (err) {
    console.error('[getAuthedUser] getCurrentMember threw:', err instanceof Error ? err.message : String(err));
  }
  if (!member) return null;
  // Clerk path already reads the row, so its role was always the stored one.
  return {
    memberId: member.id,
    id: member.clerkId ?? String(member.id),
    role: normalizeRole(member.role),
    name: member.name,
    image: member.image,
    clerkId: member.clerkId ?? undefined,
    email: member.email ?? null,
  };
}
