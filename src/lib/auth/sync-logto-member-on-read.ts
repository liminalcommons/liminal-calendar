/**
 * Defensive provisioning helper for Castalia (Logto / NextAuth) sessions.
 *
 * The auth.ts jwt callback links a logtoId onto an existing `members` row by
 * email at sign-in — but only when such a row already exists. A brand-new
 * Castalia user (no pre-existing email match) therefore ends up with a valid
 * session and NO member row, which made every protected route 401 and bounced
 * protected pages to the landing page.
 *
 * This helper closes that gap on read, mirroring syncClerkMemberOnRead: it
 * links an email-matched row that lacks a logtoId, otherwise creates a fresh
 * Logto-only member. Callers re-query after invoking. Errors are swallowed and
 * logged — a read path must never crash on a transient DB failure.
 */

import { eq } from 'drizzle-orm';
import { members } from '@/lib/db/schema';

export type LogtoIdentity = {
  logtoUserId: string;
  email?: string | null;
  name?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncLogtoMemberOnRead(db: any, identity: LogtoIdentity): Promise<void> {
  const { logtoUserId } = identity;
  const email = identity.email?.trim().toLowerCase() || null;

  try {
    // Link an existing email-matched row that doesn't have a logtoId yet.
    if (email) {
      const [byEmail] = await db
        .select()
        .from(members)
        .where(eq(members.email, email))
        .limit(1);
      if (byEmail) {
        if (!byEmail.logtoId) {
          await db
            .update(members)
            .set({ logtoId: logtoUserId, updatedAt: new Date() })
            .where(eq(members.id, byEmail.id));
        }
        return;
      }
    }

    // No existing row — create a Logto-only member. `name` is NOT NULL, so
    // fall back to the email local-part, then a generic label.
    const name = identity.name?.trim() || (email ? email.split('@')[0] : null) || 'Member';
    await db.insert(members).values({ logtoId: logtoUserId, email, name });
  } catch (err) {
    console.error(
      '[syncLogtoMemberOnRead] provision failed:',
      logtoUserId,
      err instanceof Error ? err.message : String(err),
    );
  }
}
