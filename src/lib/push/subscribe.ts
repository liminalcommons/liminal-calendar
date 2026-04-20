import { and, eq } from 'drizzle-orm';
import { pushSubscriptions } from '@/lib/db/schema';

export interface PushSubscriptionPayload {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

export type ValidatedSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function validateSubscription(raw: unknown): ValidatedSubscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const sub = raw as PushSubscriptionPayload;
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : null;
  const p256dh = typeof sub.keys?.p256dh === 'string' ? sub.keys.p256dh : null;
  const auth = typeof sub.keys?.auth === 'string' ? sub.keys.auth : null;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertPushSubscription(db: any, userId: string, sub: ValidatedSubscription) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth })
    .onConflictDoNothing();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deletePushSubscription(db: any, userId: string, endpoint?: string) {
  if (endpoint) {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  } else {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }
}
