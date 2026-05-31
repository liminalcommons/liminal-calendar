import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const CANONICAL_HOST = 'liminalcalendar.com';

/**
 * Plain middleware: redirect the legacy castalia.one host to the canonical
 * domain. Auth is handled entirely by Auth.js (Castalia/Logto) at the route
 * level — no provider middleware needed.
 */
export default function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  if (host === 'calendar.castalia.one' || host === 'www.calendar.castalia.one') {
    const url = req.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = 'https';
    url.port = '';
    return NextResponse.redirect(url, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
