import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CANONICAL_HOST = 'calendar.castalia.one';

export default function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';

  // Redirect liminalcalendar.com → calendar.castalia.one
  if (host === 'liminalcalendar.com' || host === 'www.liminalcalendar.com') {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = 'https';
    url.port = '';
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
