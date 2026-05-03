import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notificationLog } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const STALE_MS = 30 * 60_000;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({ sentAt: notificationLog.sentAt })
    .from(notificationLog)
    .orderBy(desc(notificationLog.sentAt))
    .limit(1);

  const lastSentAt = rows[0]?.sentAt ?? null;
  const ageMs = lastSentAt ? Date.now() - new Date(lastSentAt).getTime() : Infinity;
  const isStale = ageMs > STALE_MS;

  let notified = false;
  if (isStale) {
    const adminEmail = process.env.NOTIFICATION_ADMIN_EMAIL;
    if (adminEmail) {
      const subject = 'Liminal Calendar — reminders cron is stale';
      const html = `
        <p>The reminders cron has not produced a notification_log entry in over 30 minutes.</p>
        <p>Last sent at: ${lastSentAt ?? 'never'}</p>
        <p>Check chora-node crontab and /api/cron/heartbeat for details.</p>
      `;
      await sendEmail(adminEmail, subject, html);
      notified = true;
    }
  }

  return NextResponse.json({ status: isStale ? 'stale' : 'ok', notified, lastSentAt });
}
