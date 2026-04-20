/**
 * Member row upsert that runs inside the NextAuth jwt callback on first
 * sign-in. Extracted from auth.ts so it can be reasoned about and tested
 * independently of NextAuth internals.
 *
 * Behavior:
 *   - Insert (hyloId, name, email, image, role, feedToken) on first sign-in.
 *   - On conflict (returning user): update name/email/image/updatedAt but
 *     preserve role (role may have been manually edited in the DB) and
 *     preserve feedToken (ICS calendar subscription tokens must be stable).
 *   - Backfill: after the upsert, if an existing row still has a null
 *     feedToken, generate one. This handles users who signed in before the
 *     feedToken column existed.
 *
 * The call is fire-and-forget: the sign-in flow must not block on DB
 * availability. Any thrown error is swallowed.
 */

import { randomBytes } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { members } from '@/lib/db/schema';

export interface MemberSyncInput {
  hyloId: string;
  name: string | null | undefined;
  email: string | null | undefined;
  image: string | null | undefined;
  role: string | null | undefined;
}

function genFeedToken(): string {
  return `feed_${randomBytes(12).toString('hex')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncMember(db: any, input: MemberSyncInput): Promise<void> {
  const name = input.name || 'Unknown';
  const email = input.email || null;
  const image = input.image || null;
  const role = input.role || 'member';

  await db
    .insert(members)
    .values({
      hyloId: input.hyloId,
      name,
      email,
      image,
      role,
      feedToken: genFeedToken(),
    })
    .onConflictDoUpdate({
      target: members.hyloId,
      set: { name, email, image, updatedAt: new Date() },
    });

  // Backfill: any existing row without a feedToken (schema predates column)
  // gets a fresh one. Noop if the just-inserted row already has one.
  await db
    .update(members)
    .set({ feedToken: genFeedToken() })
    .where(and(eq(members.hyloId, input.hyloId), isNull(members.feedToken)));
}
