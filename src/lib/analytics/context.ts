/**
 * Server-derived context attached to every analytics event.
 *
 * Everything here is either already in the request or is a coarse bucket, and
 * none of it is stored raw: no IP address, no user-agent string, no full
 * referring URL. That keeps the "first-party, cookieless" property the panel
 * advertises while still answering the question the community actually asked —
 * who is passing through the site, and where from.
 */

import { GUEST_COOKIE } from '@/lib/guest';

/** Who the visitor is, without a database lookup on the hot path. */
export type ViewerKind = 'member' | 'guest' | 'anonymous';

// Same pattern the bug-report route uses to spot an auth session. Presence of
// the cookie is enough — we deliberately do not resolve it to a member, so a
// pageview beacon never provisions a user or touches the members table.
const SESSION_COOKIE = /^(authjs|next-auth|__Secure-authjs|__Secure-next-auth|__session|__clerk)/;

export function viewerKindFromCookies(cookieNames: string[], isGuest: boolean): ViewerKind {
  if (cookieNames.some((n) => SESSION_COOKIE.test(n))) return 'member';
  return isGuest ? 'guest' : 'anonymous';
}

/**
 * Two-letter country from the edge, when the platform provides it. Vercel sets
 * x-vercel-ip-country; Cloudflare sets cf-ipcountry. The IP itself is never
 * read or stored — only the country the platform already resolved.
 */
export function countryFromHeaders(headers: Headers): string | null {
  const raw =
    headers.get('x-vercel-ip-country') ??
    headers.get('cf-ipcountry') ??
    headers.get('x-country-code');
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * Request context that is cheap to derive and safe to store.
 */
export interface RequestAnalyticsContext {
  isGuest: boolean;
  viewer: ViewerKind;
  country: string | null;
}

export function requestContext(request: {
  headers: Headers;
  cookies: { get(name: string): { value: string } | undefined };
}): RequestAnalyticsContext {
  const isGuest = request.cookies.get(GUEST_COOKIE)?.value === '1';
  const cookieNames = cookieNamesFromHeader(request.headers.get('cookie'));
  return {
    isGuest,
    viewer: viewerKindFromCookies(cookieNames, isGuest),
    country: countryFromHeaders(request.headers),
  };
}

/** Names only — values are never parsed, so no token can be logged by accident. */
export function cookieNamesFromHeader(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(';')
    .map((c) => c.split('=')[0]?.trim())
    .filter((n): n is string => Boolean(n));
}
