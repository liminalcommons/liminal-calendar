/**
 * POST /api/account/link-clerk
 *
 * User-driven account linking. The caller MUST be authenticated with
 * BOTH Hylo (NextAuth shared cookie) and Clerk (Clerk session cookie).
 * Both session presences are the proof that the same human controls
 * both identities — no body input is taken; the IDs come from session
 * cookies only.
 *
 * Decision tree:
 *   1. Either session missing → 401 (caller must complete both
 *      sign-ins separately, then call this endpoint).
 *   2. Both sessions point to the SAME Member row (already linked) →
 *      200 { status: 'already_linked', memberId }.
 *   3. Hylo Member exists, Clerk Member does NOT → 200 +
 *      UPDATE the Hylo row to attach clerkId. Returns
 *      { status: 'clerk_attached', memberId }.
 *   4. Clerk Member exists, Hylo Member does NOT → 200 + UPDATE the
 *      Clerk row to attach hyloId. Returns
 *      { status: 'hylo_attached', memberId }.
 *   5. Both Members exist but are DIFFERENT rows → 409 Conflict +
 *      both memberIds. Future S6.3 (admin merge tool) handles this
 *      explicitly; for now the user is told an explicit merge is
 *      required.
 *   6. Neither Member exists (defensive — shouldn't happen in normal
 *      flow since syncMember runs on Hylo jwt callback and the webhook
 *      runs on Clerk user.created) → 500.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth as hyloAuth } from '../../../../../auth';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';

export const dynamic = 'force-dynamic';

export async function POST() {
  const hyloSession = await hyloAuth();
  const hyloId = (hyloSession?.user as { hyloId?: string } | undefined)?.hyloId;
  const { userId: clerkId } = await clerkAuth();

  if (!hyloId || !clerkId) {
    return NextResponse.json(
      { error: 'Both Hylo and Clerk sessions are required to link accounts.' },
      { status: 401 },
    );
  }

  const [byHylo] = await db
    .select()
    .from(members)
    .where(eq(members.hyloId, hyloId))
    .limit(1);
  const byClerk = await findMemberByClerkId(db, clerkId);

  if (byHylo && byClerk) {
    if (byHylo.id === byClerk.id) {
      return NextResponse.json({ status: 'already_linked', memberId: byHylo.id });
    }
    return NextResponse.json(
      {
        error: 'Both providers map to distinct Members; explicit merge action required.',
        hyloMemberId: byHylo.id,
        clerkMemberId: byClerk.id,
      },
      { status: 409 },
    );
  }

  if (byHylo && !byClerk) {
    await db
      .update(members)
      .set({ clerkId, updatedAt: new Date() })
      .where(eq(members.id, byHylo.id));
    return NextResponse.json({ status: 'clerk_attached', memberId: byHylo.id });
  }

  if (!byHylo && byClerk) {
    await db
      .update(members)
      .set({ hyloId, updatedAt: new Date() })
      .where(eq(members.id, byClerk.id));
    return NextResponse.json({ status: 'hylo_attached', memberId: byClerk.id });
  }

  // Neither exists — defensive. syncMember (Hylo jwt callback) and the
  // user.created webhook (Clerk) should have provisioned rows. If we get
  // here, one of those failed silently or the migration hasn't run.
  return NextResponse.json(
    { error: 'No Member rows exist for either session; sync may not have completed.' },
    { status: 500 },
  );
}
