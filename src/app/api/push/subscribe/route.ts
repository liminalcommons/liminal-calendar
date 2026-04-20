import { NextResponse } from 'next/server';
import { auth } from '@/../auth';
import { db } from '@/lib/db';
import {
  validateSubscription,
  insertPushSubscription,
  deletePushSubscription,
} from '@/lib/push/subscribe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userIdFromSession(session: any): string {
  return session.user.hyloId || session.user.id;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const validated = validateSubscription(body?.subscription);
  if (!validated) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  await insertPushSubscription(db, userIdFromSession(session), validated);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : undefined;
  await deletePushSubscription(db, userIdFromSession(session), endpoint);
  return NextResponse.json({ ok: true });
}
