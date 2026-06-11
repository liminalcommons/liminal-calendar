import { NextResponse } from 'next/server';
import { GUEST_COOKIE } from '@/lib/guest';

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
  return response;
}
