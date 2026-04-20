import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationLog } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

/**
 * Heartbeat for the external send-reminders trigger (chora-node cron).
 *
 * Reports the most recent `notification_log.sent_at` and whether it's
 * within a healthy window. Intended to be hit by an uptime monitor (e.g.,
 * UptimeRobot) every ~15 minutes; configure the monitor to alert when
 * `status === "stale"` so we learn about trigger outages within minutes
 * instead of days.
 *
 * Response:
 *   200 { status: "ok", lastSentAt, ageSeconds }
 *   200 { status: "stale", lastSentAt, ageSeconds }
 *   200 { status: "empty" } — no notifications ever sent (new install)
 *
 * Always 200 so monitors don't flap on DB latency; the monitor should
 * gate on the JSON `status` field.
 */
export const dynamic = 'force-dynamic';

// 30 minutes — generous: the cron runs every 5 min, so an outage longer
// than 30 min is a real incident worth paging on.
const STALE_AGE_SECONDS = 30 * 60;

export async function GET() {
  try {
    const [latest] = await db
      .select({ sentAt: notificationLog.sentAt })
      .from(notificationLog)
      .orderBy(desc(notificationLog.sentAt))
      .limit(1);

    if (!latest?.sentAt) {
      return NextResponse.json({ status: 'empty' });
    }

    const lastSentAt = latest.sentAt instanceof Date ? latest.sentAt : new Date(latest.sentAt);
    const ageSeconds = Math.floor((Date.now() - lastSentAt.getTime()) / 1000);
    const status = ageSeconds > STALE_AGE_SECONDS ? 'stale' : 'ok';

    return NextResponse.json({
      status,
      lastSentAt: lastSentAt.toISOString(),
      ageSeconds,
      thresholdSeconds: STALE_AGE_SECONDS,
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
