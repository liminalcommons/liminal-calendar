import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications/inbox/repo';

export const dynamic = 'force-dynamic';

/**
 * Internal test fixture: creates a synthetic inbox row for an arbitrary
 * userId. CRON_SECRET-gated so it cannot be invoked by anonymous traffic.
 * Used to verify the bell + dropdown work end-to-end without waiting for
 * a real cron tick or domain trigger.
 *
 * Body: { userId: string, title?: string, type?: string }
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

  const { userId, title, type } = (body ?? {}) as {
    userId?: string;
    title?: string;
    type?: string;
  };

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId (string) required' }, { status: 400 });
  }

  try {
    const row = await createNotification(db, {
      userId,
      type: type ?? 'test.fixture',
      title: title ?? 'Test notification — bell + inbox working',
      body: 'This is a synthetic notification fired via /api/notifications/test-fire.',
      url: '/',
      payload: { source: 'test-fire', firedAt: new Date().toISOString() },
    });
    return NextResponse.json({ success: true, notification: row });
  } catch (err) {
    console.error('[POST /api/notifications/test-fire]', err);
    return NextResponse.json(
      {
        error: 'Failed to insert test notification',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
