import { auth } from '../auth';
import { NextResponse } from 'next/server';

// Middleware attaches session but does NOT force redirects.
// Unauthenticated users can view the calendar. Sign-in is handled
// by the NavBar redirecting to auth.castalia.one gateway.
export default auth((req) => {
  // Just pass through — session is attached to req.auth automatically
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api/auth|api/cron|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
