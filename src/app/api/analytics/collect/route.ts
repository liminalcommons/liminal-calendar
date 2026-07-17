import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { GUEST_COOKIE } from '@/lib/guest';
import { analyticsEventInputSchema, recordAnalyticsEvent } from '@/lib/analytics/events';

// Public, unauthenticated beacon. The client posts a tiny JSON payload (often
// via navigator.sendBeacon on unload), we attach the server-known guest flag,
// and record one row. This endpoint intentionally never returns an error to
// the caller — analytics must never break a page — so every failure path
// resolves to 204.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      // sendBeacon may deliver a Blob whose body isn't parsed as JSON by
      // request.json() in every runtime — fall back to text.
      try {
        raw = JSON.parse(await request.text());
      } catch {
        return new NextResponse(null, { status: 204 });
      }
    }

    const parsed = analyticsEventInputSchema.safeParse(raw);
    if (!parsed.success) {
      return new NextResponse(null, { status: 204 });
    }

    // guest_enter is recorded server-side by the /guest route so it can't be
    // spoofed or inflated from the client beacon; ignore it here.
    if (parsed.data.type === 'guest_enter') {
      return new NextResponse(null, { status: 204 });
    }

    const isGuest = request.cookies.get(GUEST_COOKIE)?.value === '1';

    await recordAnalyticsEvent(db, parsed.data, { isGuest });
  } catch (err) {
    // Swallow — a missing table (pre-migration) or transient DB error must not
    // surface as a failed request in the visitor's console.
    console.error('[POST /api/analytics/collect]', err);
  }
  return new NextResponse(null, { status: 204 });
}
