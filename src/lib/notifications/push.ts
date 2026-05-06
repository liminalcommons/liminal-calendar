// @ts-expect-error no types for web-push
import webPush from 'web-push';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

// web-push rejects standard base64 padding (`=`) AND any whitespace
// contamination. The Vercel env var for VAPID was uploaded with a trailing
// newline from the original keygen output (verified via diagnostic on
// 2026-05-05), so normalize here rather than asking everyone to re-upload
// trimmed values.
function stripBase64Padding(s: string): string {
  return s.trim().replace(/=+$/g, '');
}

const VAPID_PUBLIC = stripBase64Padding(
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '',
);
const VAPID_PRIVATE = stripBase64Padding(process.env.VAPID_PRIVATE_KEY || '');
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:accounts@liminalcommons.com';

let configured = false;

function ensureVapid() {
  if (configured || !VAPID_PUBLIC || !VAPID_PRIVATE) return;
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || userIds.length === 0) {
    return { sent: 0, failed: 0 };
  }

  ensureVapid();

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
      sent++;
    } catch (err: any) {
      failed++;
      // Remove invalid subscriptions (expired or unsubscribed)
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }

  return { sent, failed };
}
