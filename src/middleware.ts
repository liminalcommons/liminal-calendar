import { NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

const CANONICAL_HOST = 'liminalcalendar.com';

// Clerk runs alongside NextAuth-Hylo. The callback redirects calendar.castalia.one
// (legacy host) to liminalcalendar.com (canonical, since the site now serves both
// providers natively without the .castalia.one shared-cookie gateway pattern).
export default clerkMiddleware((_auth, request) => {
  const host = request.headers.get('host') || '';

  if (host === 'calendar.castalia.one' || host === 'www.calendar.castalia.one') {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = 'https';
    url.port = '';
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
});

export const config = {
  // Clerk-recommended matcher: skips Next internals + all common static asset
  // extensions; explicitly includes API routes.
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
