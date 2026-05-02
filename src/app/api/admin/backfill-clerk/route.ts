/**
 * POST /api/admin/backfill-clerk
 *
 * Owner-triggered backfill that walks Clerk's user list and provisions
 * a `members` row for every Clerk identity that does not yet have one.
 * Companion to the cycle-3 defensive sync in getCurrentMember — that
 * heals on first read AFTER the user signs in again; this route heals
 * idle Clerk identities that may never sign in.
 *
 * Admin-gated. Idempotent. Returns observability counts:
 *   { scanned, alreadyProvisioned, freshlyProvisioned, failed }
 *
 * Pulls the Clerk user list with `limit: 500` (Clerk Backend SDK max).
 * If the workspace ever exceeds 500 Clerk users, paginate via offset
 * — explicit follow-up rather than implicit scope creep.
 *
 * Bypasses syncClerkMemberOnRead deliberately: we already have the
 * canonical User object from getUserList, so calling
 * syncClerkMemberWithMerge directly avoids a redundant per-user
 * getUser roundtrip (Clerk has rate limits). Mapping uses the shared
 * `clerkUserToSyncInput` helper — same one syncClerkMemberOnRead uses.
 */

import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getUserRole } from '@/lib/auth-helpers';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { findMemberByClerkId } from '@/lib/auth/find-member-by-clerk-id';
import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';
import {
  clerkUserToSyncInput,
  type ClerkUser,
} from '@/lib/auth/clerk-user-to-sync-input';

export const dynamic = 'force-dynamic';
// Backfill walks ≤500 Clerk users sequentially with one DB query each.
// Vercel default function timeout is 10s on Hobby — too tight for this
// loop in cold-pool conditions. 60s is the Hobby max and Pro default;
// fits within both. If the workspace ever exceeds ~500 Clerk users,
// paginate via offset rather than raise this further.
export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (getUserRole(session) !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let scanned = 0;
  let alreadyProvisioned = 0;
  let freshlyProvisioned = 0;
  let failed = 0;

  try {
    const cc = await clerkClient();
    const list = await cc.users.getUserList({ limit: 500 });
    const users = (list.data ?? []) as unknown as ClerkUser[];
    scanned = users.length;

    for (const user of users) {
      const existing = await findMemberByClerkId(db, user.id);
      if (existing) {
        alreadyProvisioned += 1;
        continue;
      }
      try {
        await syncClerkMemberWithMerge(db, clerkUserToSyncInput(user));
        freshlyProvisioned += 1;
      } catch (err) {
        console.error('[POST /api/admin/backfill-clerk] sync failed for', user.id, err);
        failed += 1;
      }
    }

    return NextResponse.json({
      scanned,
      alreadyProvisioned,
      freshlyProvisioned,
      failed,
    });
  } catch (err) {
    console.error('[POST /api/admin/backfill-clerk]', err);
    return NextResponse.json(
      { error: 'Backfill failed', scanned, alreadyProvisioned, freshlyProvisioned, failed },
      { status: 500 },
    );
  }
}
