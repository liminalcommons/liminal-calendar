/**
 * Admin: re-signup nudge for Hylo-only members.
 *
 * Background: when Hylo OAuth was removed (commit fde970a), `members`
 * rows whose only identity was hyloId became unable to authenticate.
 * Their events, RSVPs, and bookings still exist in the DB; they just
 * can't sign in. The Logto callback in auth.ts:108-124 will re-link
 * an existing row by email on first Castalia sign-in — so a single
 * email asking them to sign in again is enough to restore access
 * without data loss.
 *
 * GET  /api/admin/hylo-nudge       — count + sample (read-only)
 * POST /api/admin/hylo-nudge       — send nudges
 *   body: { dryRun?: boolean, limit?: number, force?: boolean }
 *     dryRun: skip Resend, just report who *would* be nudged
 *     limit:  cap per-call (default 50). Batch by re-running.
 *     force:  re-nudge even if `nudged_at` is already set (rare —
 *             only after confirming the prior nudge was lost)
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, isNotNull, isNull, count, eq } from 'drizzle-orm';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email';
import { hyloResignupEmail } from '@/lib/notifications/hylo-resignup-email';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

// Single predicate for "needs re-signup nudge". Used by both GET (count +
// sample) and POST (target selection) so they can never drift.
//
// Note: we deliberately do NOT filter on `hyloId IS NOT NULL` even though
// the original cohort is Hylo-era members. The chk_members_identity
// constraint guaranteed that any pre-Logto/pre-Clerk row had hyloId set,
// so (clerkId IS NULL AND logtoId IS NULL AND email IS NOT NULL) already
// captures the same set. Skipping the hyloId clause lets us drop that
// column without breaking this endpoint.
function hyloOnlyPredicate(includeAlreadyNudged: boolean) {
  const base = [
    isNull(members.clerkId),
    isNull(members.logtoId),
    isNotNull(members.email),
  ];
  if (!includeAlreadyNudged) base.push(isNull(members.nudgedAt));
  return and(...base);
}

async function requireAdmin() {
  const user = await getAuthedUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  try {
    const [pending] = await db
      .select({ count: count() })
      .from(members)
      .where(hyloOnlyPredicate(false));
    const [total] = await db
      .select({ count: count() })
      .from(members)
      .where(hyloOnlyPredicate(true));

    // 5-row sample so the admin can sanity-check who's about to be emailed
    // before pulling the trigger on a 500-person batch.
    const sample = await db
      .select({
        id: members.id,
        name: members.name,
        email: members.email,
        nudgedAt: members.nudgedAt,
      })
      .from(members)
      .where(hyloOnlyPredicate(true))
      .limit(5);

    return NextResponse.json({
      pending: Number(pending?.count ?? 0),
      totalHyloOnly: Number(total?.count ?? 0),
      alreadyNudged: Number(total?.count ?? 0) - Number(pending?.count ?? 0),
      sample,
    });
  } catch (err) {
    console.error('[GET /api/admin/hylo-nudge]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = body as Record<string, any>;
  const dryRun = r.dryRun === true;
  const force = r.force === true;
  const limit = Math.min(
    Math.max(1, typeof r.limit === 'number' ? r.limit : DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  try {
    const targets = await db
      .select({
        id: members.id,
        name: members.name,
        email: members.email,
      })
      .from(members)
      .where(hyloOnlyPredicate(force))
      .limit(limit);

    if (targets.length === 0) {
      return NextResponse.json({
        dryRun,
        attempted: 0,
        sent: 0,
        failed: 0,
        message: 'No Hylo-only members pending nudge.',
      });
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        wouldSend: targets.length,
        targets: targets.map(t => ({ id: t.id, name: t.name, email: t.email })),
      });
    }

    // Send sequentially — Resend's rate limit is friendly (~10/s on standard
    // plans) and we cap per-call at MAX_LIMIT=500, so the worst case is ~50s
    // which fits inside Vercel's 300s function timeout. Parallelising would
    // risk burst-blocking from Resend and would also make per-row error
    // attribution harder.
    const results: Array<{ id: number; email: string; ok: boolean; error?: string }> = [];
    for (const t of targets) {
      if (!t.email) {
        results.push({ id: t.id, email: '(missing)', ok: false, error: 'no email' });
        continue;
      }
      const { subject, html } = hyloResignupEmail({ name: t.name });
      const res = await sendEmail(t.email, subject, html);
      if (res.success) {
        try {
          await db
            .update(members)
            .set({ nudgedAt: new Date(), updatedAt: new Date() })
            .where(eq(members.id, t.id));
          results.push({ id: t.id, email: t.email, ok: true });
        } catch (err) {
          // Email landed but the marker write failed — report so the admin
          // knows the next run will re-send to this person. Rare; usually
          // means a transient DB blip mid-batch.
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ id: t.id, email: t.email, ok: true, error: `email-sent-marker-failed: ${msg}` });
        }
      } else {
        results.push({ id: t.id, email: t.email, ok: false, error: res.error });
      }
    }

    const sent = results.filter(r => r.ok).length;
    const failed = results.length - sent;

    return NextResponse.json({
      dryRun: false,
      attempted: results.length,
      sent,
      failed,
      results,
    });
  } catch (err) {
    console.error('[POST /api/admin/hylo-nudge]', err);
    return NextResponse.json({ error: 'Nudge run failed' }, { status: 500 });
  }
}

// Block accidental GETs of POST targets and vice-versa via the catch-all
// to keep the surface tight.
export async function DELETE() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 405 });
}
