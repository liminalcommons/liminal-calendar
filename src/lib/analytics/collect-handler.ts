import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { GUEST_COOKIE } from '@/lib/guest';
import { analyticsEventInputSchema, recordAnalyticsEvent } from '@/lib/analytics/events';

/**
 * Shared handler for the public analytics beacon. Served from two paths:
 *
 *   /api/pulse             — the live endpoint the client posts to
 *   /api/analytics/collect — legacy alias, kept so beacons from cached JS
 *                            bundles and service-worker-held clients keep
 *                            landing after a deploy
 *
 * The endpoint moved because `/api/analytics/collect` matches the shape
 * content blockers look for: EasyPrivacy and uBlock Origin's built-in lists
 * target both the `analytics` path segment and `collect` (Google Analytics'
 * own hit endpoint is `/collect`). A blocked beacon fails in the browser
 * before it ever reaches the server, so no amount of server-side logging
 * shows it — the dashboard just reads zero. First-party paths that don't
 * look like tracker paths are not filtered, hence `/api/pulse`.
 *
 * The caller posts a tiny JSON payload (often via navigator.sendBeacon on
 * unload); we attach the server-known guest flag and record one row. This
 * endpoint intentionally never returns an error to the caller — analytics
 * must never break a page — so every failure path resolves to 204.
 */
export async function handleCollect(request: NextRequest) {
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
    // surface as a failed request in the visitor's console. The admin health
    // panel (/api/admin/analytics) is where this becomes visible instead.
    console.error('[analytics collect]', err);
  }
  return new NextResponse(null, { status: 204 });
}
