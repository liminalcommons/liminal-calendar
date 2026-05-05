import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifications, notificationLog, pushSubscriptions } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';

/**
 * Comprehensive health probe for the notification system. Reports on:
 *
 *   1. notification_log — cron-side delivery dedupe.
 *      Stale = chora-node send-reminders trigger is down (existing /heartbeat).
 *   2. notifications    — inbox events. Stale = no triggers fired recently.
 *   3. push_subscriptions — number of devices currently subscribed.
 *
 * Designed to be polled by UptimeRobot / chora-node cron / a Claude
 * /schedule agent every ~15 min. The `status` field is the rollup:
 *   ok      — everything fresh within thresholds
 *   stale   — at least one signal is older than threshold
 *   empty   — system has never produced data (fresh install)
 *   error   — DB query threw
 *
 * Always returns HTTP 200 (except on db error → 500) so uptime monitors
 * don't flap; gate alerts on the `status` field.
 */
export const dynamic = 'force-dynamic';

const STALE_LOG_AGE_SECONDS = 30 * 60; // 30 min — matches /api/cron/heartbeat
const STALE_INBOX_AGE_SECONDS = 24 * 60 * 60; // 24 h — inbox is bursty; only alert on a full day of silence

interface ChannelHealth {
  status: 'ok' | 'stale' | 'empty';
  lastAt: string | null;
  ageSeconds: number | null;
  thresholdSeconds: number;
  rowCount: number;
}

async function probeChannel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timestampCol: any,
  threshold: number,
): Promise<ChannelHealth> {
  const [latest] = await db.select({ ts: timestampCol }).from(table).orderBy(desc(timestampCol)).limit(1);
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)) as Array<{ count: number }>;

  if (!latest?.ts) {
    return {
      status: 'empty',
      lastAt: null,
      ageSeconds: null,
      thresholdSeconds: threshold,
      rowCount: Number(count ?? 0),
    };
  }
  const lastAt = latest.ts instanceof Date ? latest.ts : new Date(latest.ts as string);
  const ageSeconds = Math.floor((Date.now() - lastAt.getTime()) / 1000);
  return {
    status: ageSeconds > threshold ? 'stale' : 'ok',
    lastAt: lastAt.toISOString(),
    ageSeconds,
    thresholdSeconds: threshold,
    rowCount: Number(count ?? 0),
  };
}

export async function GET() {
  try {
    const [log, inbox, subsCount] = await Promise.all([
      probeChannel(notificationLog, notificationLog.sentAt, STALE_LOG_AGE_SECONDS),
      probeChannel(notifications, notifications.createdAt, STALE_INBOX_AGE_SECONDS),
      (async () => {
        const [{ count }] = (await db
          .select({ count: sql<number>`count(*)::int` })
          .from(pushSubscriptions)) as Array<{ count: number }>;
        return Number(count ?? 0);
      })(),
    ]);

    // Rollup: ok if both signals are ok or empty; stale if either is stale.
    const channelStatuses = [log.status, inbox.status];
    const status: 'ok' | 'stale' | 'empty' = channelStatuses.includes('stale')
      ? 'stale'
      : channelStatuses.every((s) => s === 'empty')
        ? 'empty'
        : 'ok';

    return NextResponse.json({
      status,
      checkedAt: new Date().toISOString(),
      log,
      inbox,
      pushSubscriptions: { count: subsCount },
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
