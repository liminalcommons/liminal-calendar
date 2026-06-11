import { getAuthedUser, type AuthedUser } from '@/lib/auth/get-authed-user';
import { WeeklyCalendarPage } from '@/components/calendar/WeeklyCalendarPage';

export const dynamic = 'force-dynamic';

/**
 * /week — the weekly calendar's canonical URL, reachable by anyone (no guest
 * cookie or sign-in required; non-members see public events with meeting
 * links redacted). Sibling of /list and /month.
 */
export default async function WeekPage() {
  let authed: AuthedUser | null = null;
  try {
    authed = await getAuthedUser();
  } catch (err) {
    console.error('[WeekPage] getAuthedUser failed:', err instanceof Error ? err.message : String(err));
  }
  return <WeeklyCalendarPage authed={authed} />;
}
