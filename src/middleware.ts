import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

const CANONICAL_HOST = 'liminalcalendar.com';

const clerk = clerkMiddleware((_auth, request) => {
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

// Bypass Clerk entirely for /api/cron/* — those routes use CRON_SECRET Bearer
// auth, and Clerk's default behavior is to reject any non-JWT Bearer token at
// the middleware layer before the route handler runs. Negative lookaheads in
// the `matcher` config don't reliably exclude paths from Clerk's processing,
// so we gate at runtime instead.
export default function middleware(req: NextRequest, ev: unknown) {
  if (req.nextUrl.pathname.startsWith('/api/cron/')) {
    const res = NextResponse.next();
    res.headers.set('x-mw-marker', 'cron-bypass-v3');
    return res;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (clerk as any)(req, ev);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
