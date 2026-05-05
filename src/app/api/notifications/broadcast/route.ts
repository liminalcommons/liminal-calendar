import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { sendPushToUsers } from '@/lib/notifications/push';
import { createNotification } from '@/lib/notifications/inbox/repo';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Admin broadcast: send a web push (and write an inbox row) to every user
 * with at least one push subscription. CRON_SECRET-gated for now — promote
 * to admin-session auth once the admin UI lands.
 *
 * Body: { title: string, body?: string, url?: string }
 *
 * Returns: { devices, recipients, pushed, failed, inboxCreated }
 *   devices       = number of distinct push subscriptions found
 *   recipients    = number of distinct user_ids targeted
 *   pushed        = devices that received the push (sendPushToUsers.sent)
 *   failed        = devices that failed (subscription expired etc.)
 *   inboxCreated  = inbox rows successfully written
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, body: pushBody, url } = (body ?? {}) as {
    title?: string;
    body?: string;
    url?: string;
  };

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title (string) required' }, { status: 400 });
  }

  const finalBody = pushBody && typeof pushBody === 'string' ? pushBody : '';
  const finalUrl = url && typeof url === 'string' ? url : '/';

  // Collect distinct recipient user_ids from push_subscriptions.
  let userIds: string[] = [];
  let deviceCount = 0;
  try {
    const rows = await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
    deviceCount = (rows as { userId: string }[]).length;
    userIds = [...new Set((rows as { userId: string }[]).map((r) => r.userId))];
  } catch (err) {
    console.error('[POST /api/notifications/broadcast] subscription lookup', err);
    return NextResponse.json(
      { error: 'Failed to enumerate push subscriptions' },
      { status: 500 },
    );
  }

  if (userIds.length === 0) {
    return NextResponse.json({
      devices: 0,
      recipients: 0,
      pushed: 0,
      failed: 0,
      inboxCreated: 0,
    });
  }

  let pushed = 0;
  let failed = 0;
  try {
    const result = await sendPushToUsers(userIds, {
      title,
      body: finalBody,
      url: finalUrl,
      tag: `broadcast-${Date.now()}`,
    });
    pushed = result.sent;
    failed = result.failed;
  } catch (err) {
    console.error('[POST /api/notifications/broadcast] push send', err);
    failed = deviceCount;
  }

  let inboxCreated = 0;
  for (const uid of userIds) {
    try {
      await createNotification(db, {
        userId: uid,
        type: 'broadcast',
        title,
        body: finalBody || null,
        url: finalUrl,
        payload: { source: 'admin-broadcast', firedAt: new Date().toISOString() },
      });
      inboxCreated++;
    } catch (err) {
      console.error('[POST /api/notifications/broadcast] inbox write', uid, err);
    }
  }

  return NextResponse.json({
    devices: deviceCount,
    recipients: userIds.length,
    pushed,
    failed,
    inboxCreated,
  });
}
