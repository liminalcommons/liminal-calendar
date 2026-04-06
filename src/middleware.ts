import { NextResponse } from 'next/server';

// Middleware is a pass-through. Auth is handled by the shared .castalia.one
// cookie set by auth.castalia.one. No token refresh or redirect logic here —
// that caused redirect loops that cleared the session cookie.
export default function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|api/cron|api/calendar|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
