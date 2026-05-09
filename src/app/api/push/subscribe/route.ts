import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import {
  validateSubscription,
  insertPushSubscription,
  deletePushSubscription,
} from '@/lib/push/subscribe';

export async function POST(request: Request) {
  const authed = await getAuthedUser();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const validated = validateSubscription(body?.subscription);
  if (!validated) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  await insertPushSubscription(db, authed.id, validated, authed.memberId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const authed = await getAuthedUser();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : undefined;
  await deletePushSubscription(db, authed.id, endpoint);
  return NextResponse.json({ ok: true });
}
