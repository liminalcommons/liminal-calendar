import { NextRequest, NextResponse } from 'next/server';
import { sendPushToUsers } from '@/lib/notifications/push';

export const dynamic = 'force-dynamic';

/**
 * Minimal push-only test endpoint at a fresh route path (sibling of
 * /api/notifications/* which got stuck on a Vercel build cache).
 * CRON_SECRET-gated. Body: { userIds: string[], title?: string, body?: string }
 *
 * Calls sendPushToUsers directly — DB push_subscriptions lookup happens
 * inside that helper, no enumeration in this handler.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userIds, title, body: pushBody } = (body ?? {}) as {
    userIds?: string[];
    title?: string;
    body?: string;
  };

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: 'userIds (string[]) required' }, { status: 400 });
  }

  try {
    const result = await sendPushToUsers(userIds, {
      title: title ?? 'Push test',
      body: pushBody ?? 'OS-level web push from prod.',
      url: '/',
      tag: `push-test-${Date.now()}`,
    });
    return NextResponse.json({ success: true, ...result, userIds });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'sendPushToUsers threw',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
