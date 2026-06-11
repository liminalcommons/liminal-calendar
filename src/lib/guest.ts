/**
 * Guest tier — an unauthenticated visitor who explicitly entered the calendar
 * via "Enter as Guest" on the landing page. Guests can browse the calendar and
 * read public event details, but participation affordances (Join Meeting) are
 * disabled until they sign up.
 *
 * The flag is a plain (non-httpOnly) cookie set by the /guest route handler so
 * both the server page and client components can read it without prop-drilling
 * through the calendar tree.
 */

export const GUEST_COOKIE = 'liminal_guest';

/** Client-side guest check. Safe under SSR (returns false). */
export function isGuestClient(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith(`${GUEST_COOKIE}=1`));
}
