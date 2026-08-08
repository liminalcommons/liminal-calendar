/**
 * Admin: compose and send the monthly community update.
 *
 * Audience is the deduped union of members-with-email and newsletter opt-ins,
 * minus anyone who has unsubscribed (see lib/newsletter/audience.ts). The send
 * loop mirrors the resignup-nudge route: sequential sends inside the 300s
 * function budget, per-recipient results, and a dry-run mode so the admin can
 * preview the audience before committing.
 *
 * GET  /api/admin/newsletter        — audience summary + sample (read-only)
 * POST /api/admin/newsletter        — send
 *   body: { subject, body, dryRun?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { fetchNewsletterAudience } from '@/lib/newsletter/repo';
import { isMissingTableError } from '@/lib/db/errors';
import { buildMonthlyEmail } from '@/lib/newsletter/monthly-email';
import { unsubscribeToken, unsubscribeUrl } from '@/lib/newsletter/unsubscribe-token';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Cap one send so it comfortably fits the 300s budget at Resend's ~10/s. For a
// community list this covers the whole audience in a single pass; a larger list
// is truncated (and reported) rather than risking a timeout mid-blast.
const MAX_RECIPIENTS_PER_SEND = 2000;

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
    const audience = await fetchNewsletterAudience(db);
    return NextResponse.json({
      totalRecipients: audience.entries.length,
      memberCount: audience.memberCount,
      subscriberCount: audience.subscriberCount,
      suppressedCount: audience.suppressedCount,
      sample: audience.entries.slice(0, 5).map((e) => ({ email: e.email, name: e.name })),
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      // newsletter_subscribers is declared in the migration chain behind two
      // UNIQUE constraints that can fail against live data, so it is one of
      // the tables that actually goes missing. Report it as an actionable
      // state the panel can act on (Repair schema) rather than an opaque 500.
      console.error('[GET /api/admin/newsletter] newsletter_subscribers table missing');
      return NextResponse.json({
        schemaMissing: true,
        totalRecipients: 0,
        memberCount: 0,
        subscriberCount: 0,
        suppressedCount: 0,
        sample: [],
      });
    }
    console.error('[GET /api/admin/newsletter]', err);
    return NextResponse.json({ error: 'Failed to load audience' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const r = body as Record<string, unknown>;
  const subject = typeof r.subject === 'string' ? r.subject.trim() : '';
  const messageBody = typeof r.body === 'string' ? r.body.trim() : '';
  const dryRun = r.dryRun === true;

  if (!subject) {
    return NextResponse.json({ error: 'subject is required' }, { status: 400 });
  }
  if (!messageBody) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }

  try {
    const audience = await fetchNewsletterAudience(db);
    const all = audience.entries;
    const truncated = all.length > MAX_RECIPIENTS_PER_SEND;
    const targets = all.slice(0, MAX_RECIPIENTS_PER_SEND);

    if (targets.length === 0) {
      return NextResponse.json({
        dryRun,
        attempted: 0,
        sent: 0,
        failed: 0,
        message: 'No recipients — the audience is empty.',
      });
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        wouldSend: targets.length,
        truncated,
        totalAudience: all.length,
        memberCount: audience.memberCount,
        subscriberCount: audience.subscriberCount,
        suppressedCount: audience.suppressedCount,
        sample: targets.slice(0, 10).map((t) => ({ email: t.email, name: t.name })),
      });
    }

    // Verify signing secret up front so we fail before sending anything with a
    // broken (non-working) unsubscribe link.
    try {
      unsubscribeToken(targets[0].email);
    } catch {
      return NextResponse.json(
        { error: 'STOP_TOKEN_SECRET (or CRON_SECRET) must be configured to send — unsubscribe links require it.' },
        { status: 500 },
      );
    }

    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const t of targets) {
      const unsub = unsubscribeUrl(t.email);
      const { subject: subj, html } = buildMonthlyEmail({
        subject,
        body: messageBody,
        greetingName: t.name,
        unsubscribeUrl: unsub,
      });
      const res = await sendEmail(t.email, subj, html, {
        headers: {
          // RFC 8058 one-click unsubscribe — surfaces the native "Unsubscribe"
          // control in Gmail/Apple Mail; the POST endpoint honors it.
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      results.push({ email: t.email, ok: res.success, error: res.error });
    }

    const sent = results.filter((x) => x.ok).length;
    const failed = results.length - sent;

    return NextResponse.json({
      dryRun: false,
      attempted: results.length,
      sent,
      failed,
      truncated,
      totalAudience: all.length,
      // Only surface failures in detail to keep the payload small on big sends.
      failures: results.filter((x) => !x.ok).slice(0, 50),
    });
  } catch (err) {
    console.error('[POST /api/admin/newsletter]', err);
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }
}
