/**
 * Resolve the current request to a unified user shape, accepting either
 * a Hylo (NextAuth) session or a Clerk session.
 *
 * Returned object always carries the canonical `memberId` (members.id)
 * when it can be resolved — that is the integer FK that every
 * person-bearing table now points at (Phase 2 of identity
 * canonicalization). When the lookup can't complete (e.g. inside a
 * test using a fake db), `memberId` falls through to null and the
 * legacy provider-string `id` continues to drive behavior.
 */

import { eq } from 'drizzle-orm';
import { auth as hyloAuth } from '../../../auth';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { getCurrentMember } from './get-current-member';
import type { UserRole } from '@/lib/auth-helpers';

export type AuthedUser = {
  /** Canonical integer identity — `members.id`. Null only when no row matched. */
  memberId: number | null;
  id: string;
  role: UserRole;
  name: string | null;
  image: string | null;
  hyloId?: string;
  clerkId?: string;
  email?: string | null;
};

async function lookupMemberIdByHyloId(hyloId: string): Promise<number | null> {
  try {
    const [row] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.hyloId, hyloId))
      .limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

export async function getAuthedUser(): Promise<AuthedUser | null> {
  // Hylo path — fast: build from the JWT, then look up memberId in a
  // focused query. The dual-write window needs memberId, but if the db
  // isn't fully set up (test fake), the lookup yields null and the
  // route continues with the legacy string-id only.
  const session = await hyloAuth();
  if (session?.user) {
    const u = session.user as {
      hyloId?: string;
      id?: string;
      role?: string;
      name?: string | null;
      image?: string | null;
      email?: string | null;
    };
    const role: UserRole =
      u.role === 'admin' ? 'admin' : u.role === 'host' ? 'host' : 'member';
    const stringId = u.hyloId ?? u.id ?? 'unknown';
    const memberId = u.hyloId ? await lookupMemberIdByHyloId(u.hyloId) : null;
    return {
      memberId,
      id: stringId,
      role,
      name: u.name ?? null,
      image: u.image ?? null,
      hyloId: u.hyloId,
      email: u.email ?? null,
    };
  }

  // Clerk path — falls through to getCurrentMember which already does
  // the defensive provisioning (syncClerkMemberOnRead). The members row
  // is the canonical source of identity here.
  const member = await getCurrentMember(db);
  if (!member) return null;
  const role: UserRole =
    member.role === 'admin' ? 'admin' : member.role === 'host' ? 'host' : 'member';
  return {
    memberId: member.id,
    id: member.clerkId ?? member.hyloId ?? String(member.id),
    role,
    name: member.name,
    image: member.image,
    clerkId: member.clerkId ?? undefined,
    hyloId: member.hyloId ?? undefined,
    email: member.email ?? null,
  };
}
