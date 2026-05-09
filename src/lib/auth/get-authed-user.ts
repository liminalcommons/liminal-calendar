/**
 * Resolve the current request to a unified user shape, accepting
 * either a Hylo (NextAuth) session or a Clerk session. Returns null
 * when no session is active or no matching Member row exists.
 *
 * Hylo path is unchanged (no DB lookup) for byte-identical behavior.
 * Clerk path resolves the Member row via getCurrentMember (which
 * defensively provisions on first read).
 */

import { auth as hyloAuth } from '../../../auth';
import { db } from '@/lib/db';
import { getCurrentMember } from './get-current-member';
import type { UserRole } from '@/lib/auth-helpers';

export type AuthedUser = {
  id: string;
  role: UserRole;
  name: string | null;
  image: string | null;
  hyloId?: string;
  clerkId?: string;
  email?: string | null;
};

export async function getAuthedUser(): Promise<AuthedUser | null> {
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
    return {
      id: u.hyloId ?? u.id ?? 'unknown',
      role,
      name: u.name ?? null,
      image: u.image ?? null,
      hyloId: u.hyloId,
      email: u.email ?? null,
    };
  }

  const member = await getCurrentMember(db);
  if (!member) return null;
  const role: UserRole =
    member.role === 'admin' ? 'admin' : member.role === 'host' ? 'host' : 'member';
  return {
    id: member.clerkId ?? member.hyloId ?? String(member.id),
    role,
    name: member.name,
    image: member.image,
    clerkId: member.clerkId ?? undefined,
    hyloId: member.hyloId ?? undefined,
    email: member.email ?? null,
  };
}
