import { NextResponse } from 'next/server';
import { GUEST_COOKIE } from '@/lib/guest';
import { db } from '@/lib/db';
import { recordAnalyticsEvent } from '@/lib/analytics/events';

/**
 * "Enter as Guest" — sets the guest cookie and bounces to the calendar.
 * The cookie is intentionally NOT httpOnly: client components (Join Meeting
 * gating) read it directly via isGuestClient().
 */
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set(GUEST_COOKIE, '1', {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60, // 30 days of browsing before re-choosing
    path: '/',
  });

  // Record the guest entry server-side (authoritative guest count — can't be
  // spoofed from the client beacon). Awaited so the write isn't dropped when a
  // serverless function terminates right after the redirect; guarded so a
  // tracking failure can never block entering the calendar.
  try {
    await recordAnalyticsEvent(db, { type: 'guest_enter', path: '/guest' }, { isGuest: true });
  } catch (err) {
    console.error('[GET /guest] analytics record failed:', err);
  }

  return response;
}
