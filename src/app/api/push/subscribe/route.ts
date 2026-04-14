import { NextResponse } from 'next/server';
import { auth } from '@/../auth';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).hyloId || (session.user as any).id;
  const body = await request.json();
  const { subscription } = body;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).hyloId || (session.user as any).id;
  const body = await request.json();
  const { endpoint } = body;

  if (endpoint) {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  } else {
    // Delete all subscriptions for user
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  return NextResponse.json({ ok: true });
}
