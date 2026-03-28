import { auth } from '../auth';
import { NextResponse } from 'next/server';

const AUTH_GATEWAY = 'https://auth.castalia.one';

// Middleware attaches session and handles token expiry.
// When the Hylo access token is expired and can't be refreshed,
// redirect to the auth gateway to get a fresh token silently.
export default auth((req) => {
  const token = (req as any).auth;

  // If user has a session but the access token is expired, redirect to gateway
  // to silently refresh. The gateway will re-auth with Hylo (user already consented)
  // and redirect back with a fresh cookie.
  if (token?.accessToken && token?.accessTokenExpires) {
    const expires = token.accessTokenExpires as number;
    const isExpired = Date.now() > expires - 30_000; // 30s buffer

    if (isExpired && !token.refreshToken) {
      const currentUrl = req.nextUrl.toString();
      // Only redirect page requests, not API calls or assets
      const isPageRequest = !req.nextUrl.pathname.startsWith('/api/') &&
                            !req.nextUrl.pathname.startsWith('/_next/');
      if (isPageRequest) {
        const gatewayUrl = `${AUTH_GATEWAY}/signin?callbackUrl=${encodeURIComponent(currentUrl)}`;
        return NextResponse.redirect(gatewayUrl);
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api/auth|api/cron|api/calendar|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
