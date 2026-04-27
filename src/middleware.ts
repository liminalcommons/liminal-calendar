import { NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

const CANONICAL_HOST = 'calendar.castalia.one';

// Clerk runs alongside NextAuth-Hylo. In S1 it observes only — no `auth.protect()`,
// no route gates. Composition keeps the existing host-redirect intact.
export default clerkMiddleware((_auth, request) => {
  const host = request.headers.get('host') || '';

  if (host === 'liminalcalendar.com' || host === 'www.liminalcalendar.com') {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = 'https';
    url.port = '';
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
