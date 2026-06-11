import { cookies } from 'next/headers';
import { getAuthedUser, type AuthedUser } from '@/lib/auth/get-authed-user';
import { GUEST_COOKIE } from '@/lib/guest';
import { MarketingLanding } from '@/components/MarketingLanding';
import { WeeklyCalendarPage } from '@/components/calendar/WeeklyCalendarPage';

export const dynamic = 'force-dynamic';

/**
 * `/` is a router between the two front doors, each of which also has its own
 * canonical URL: the landing page lives at /about, the weekly calendar at
 * /week. Members and guests land on the calendar; everyone else gets the
 * landing page.
 */
export default async function HomePage() {
  // Defensive: any throw inside getAuthedUser (e.g. a stale session cookie
  // that decodes to an unexpected shape, a transient DB blip, or a Clerk SDK
  // init issue) used to crash the Server Components render with a generic
  // "Application error" digest. Fall through to MarketingLanding instead so
  // the public landing page is always reachable.
  let authed: AuthedUser | null = null;
  try {
    authed = await getAuthedUser();
  } catch (err) {
    console.error('[HomePage] getAuthedUser failed:', err instanceof Error ? err.message : String(err));
  }
  // Guest tier: an unauthenticated visitor who clicked "Enter as Guest" gets
  // the calendar in read-only mode (see lib/guest.ts).
  const isGuest = (await cookies()).get(GUEST_COOKIE)?.value === '1';
  if (!authed && !isGuest) {
    return <MarketingLanding />;
  }
  return <WeeklyCalendarPage authed={authed} />;
}
