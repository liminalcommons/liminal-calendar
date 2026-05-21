/**
 * Member row upsert keyed by Clerk identity.
 *
 * Behavior:
 *   - Insert (clerkId, name, email, image, role='member', feedToken) on
 *     first Clerk sign-in.
 *   - On conflict (returning Clerk user): update name/email/image/updatedAt
 *     but preserve role (DB may have manual edits) and feedToken
 *     (ICS subscription tokens must remain stable).
 *   - Backfill: if any existing row matched by clerkId still has a null
 *     feedToken, generate one.
 *
 * Fire-and-forget: caller should not block on DB availability.
 */

import { randomBytes } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { members } from '@/lib/db/schema';

export interface ClerkMemberSyncInput {
  clerkId: string;
  name: string | null | undefined;
  email: string | null | undefined;
  image: string | null | undefined;
}

function genFeedToken(): string {
  return `feed_${randomBytes(12).toString('hex')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncClerkMember(db: any, input: ClerkMemberSyncInput): Promise<void> {
  const name = input.name || 'Unknown';
  const email = input.email || null;
  const image = input.image || null;

  await db
    .insert(members)
    .values({
      clerkId: input.clerkId,
      name,
      email,
      image,
      role: 'member',
      feedToken: genFeedToken(),
    })
    .onConflictDoUpdate({
      target: members.clerkId,
      set: { name, email, image, updatedAt: new Date() },
    });

  await db
    .update(members)
    .set({ feedToken: genFeedToken() })
    .where(and(eq(members.clerkId, input.clerkId), isNull(members.feedToken)));
}
