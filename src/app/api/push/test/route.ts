import { NextResponse } from 'next/server';
import { auth } from '@/../auth';
import { sendPushToUsers } from '@/lib/notifications/push';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userIdFromSession(session: any): string {
  return session.user.hyloId || session.user.id;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { title?: string; body?: string; url?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const userId = userIdFromSession(session);
  const result = await sendPushToUsers([userId], {
    title: body.title || 'Test notification',
    body: body.body || 'If you can see this, push works.',
    url: body.url || '/',
    tag: `test-${Date.now()}`,
  });

  return NextResponse.json({ ok: true, userId, ...result });
}
