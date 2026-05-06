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

  // Diagnostic: report VAPID key shape (no key contents leaked).
  const rawPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '';
  const rawPrivate = process.env.VAPID_PRIVATE_KEY || '';
  const diagnostic = {
    publicKey: {
      length: rawPublic.length,
      hasEquals: rawPublic.includes('='),
      hasPlus: rawPublic.includes('+'),
      hasSlash: rawPublic.includes('/'),
      firstChars: rawPublic.slice(0, 4),
      lastChars: rawPublic.slice(-4),
    },
    privateKey: {
      length: rawPrivate.length,
      hasEquals: rawPrivate.includes('='),
      hasPlus: rawPrivate.includes('+'),
      hasSlash: rawPrivate.includes('/'),
    },
  };

  try {
    const result = await sendPushToUsers(userIds, {
      title: title ?? 'Push test',
      body: pushBody ?? 'OS-level web push from prod.',
      url: '/',
      tag: `push-test-${Date.now()}`,
    });
    return NextResponse.json({ success: true, ...result, userIds, diagnostic });
  } catch (err) {
    // Drill into nested errors — Drizzle wraps the underlying Postgres
    // / Neon error and the message field only shows "Failed query".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    return NextResponse.json(
      {
        error: 'sendPushToUsers threw',
        details: e?.message ?? String(err),
        cause: e?.cause?.message ?? null,
        causeCode: e?.cause?.code ?? null,
        causeName: e?.cause?.name ?? null,
        sourceError: e?.sourceError?.message ?? null,
        stack: e?.stack?.split('\n').slice(0, 5).join('\n') ?? null,
        diagnostic,
      },
      { status: 500 },
    );
  }
}
