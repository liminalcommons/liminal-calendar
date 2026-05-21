import { NextResponse } from 'next/server';
import { auth } from '@/../auth';
import { sendPushToUsers } from '@/lib/notifications/push';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userIdFromSession(session: any): string | undefined {
  return session?.user?.logtoUserId || session?.user?.id;
}

export async function POST(request: Request) {
  let session;
  try {
    session = await auth();
  } catch (err) {
    return NextResponse.json(
      { error: 'auth() threw', details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userIdFromSession(session);
  if (!userId) {
    return NextResponse.json(
      {
        error: 'No userId on session',
        sessionUserKeys: Object.keys(session.user),
      },
      { status: 500 },
    );
  }

  let body: { title?: string; body?: string; url?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body ok
  }

  try {
    const result = await sendPushToUsers([userId], {
      title: body.title || 'Test notification',
      body: body.body || 'If you can see this, push works.',
      url: body.url || '/',
      tag: `test-${Date.now()}`,
    });
    return NextResponse.json({ ok: true, userId, ...result });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    return NextResponse.json(
      {
        error: 'sendPushToUsers threw',
        details: e?.message ?? String(err),
        cause: e?.cause?.message ?? null,
        causeCode: e?.cause?.code ?? null,
        stack: e?.stack?.split('\n').slice(0, 6).join('\n') ?? null,
      },
      { status: 500 },
    );
  }
}
