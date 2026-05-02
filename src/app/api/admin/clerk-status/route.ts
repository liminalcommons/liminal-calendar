/**
 * GET /api/admin/clerk-status
 *
 * Diagnostic probe for the Clerk → members provisioning gap.
 *
 * Returns the count of users known to Clerk vs. the count of `members`
 * rows that carry a non-null `clerkId`. Their difference (`gap`) is the
 * number of Clerk identities that have never been provisioned into our
 * DB — which is the exact failure mode the cal-clerk-userlist task is
 * tracking. A persistent non-zero `gap` means the `user.created` webhook
 * is not delivering, the signing secret is mismatched, or an earlier
 * webhook delivery failed silently.
 *
 * Admin-gated. Read-only — no DB writes, no Clerk mutations.
 */

import { NextResponse } from 'next/server';
import { count, isNotNull } from 'drizzle-orm';
import { auth } from '../../../../../auth';
import { getUserRole } from '@/lib/auth-helpers';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (getUserRole(session) !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const cc = await clerkClient();
    const clerkUsersInClerk = await cc.users.getCount();

    const [row] = await db
      .select({ count: count() })
      .from(members)
      .where(isNotNull(members.clerkId));
    const membersWithClerkId = Number(row?.count ?? 0);

    return NextResponse.json({
      clerkUsersInClerk,
      membersWithClerkId,
      gap: clerkUsersInClerk - membersWithClerkId,
    });
  } catch (err) {
    console.error('[GET /api/admin/clerk-status]', err);
    return NextResponse.json(
      { error: 'Failed to query Clerk-status probe' },
      { status: 500 },
    );
  }
}
