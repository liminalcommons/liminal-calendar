import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import { getEvents, LIMINAL_COMMONS_GROUP_ID } from '@/lib/hylo-client';
import { hyloEventToDisplayEvent } from '@/lib/display-event';
import { NavBar } from '@/components/NavBar';
import { SubscribeBanner } from '@/components/SubscribeBanner';
import { WeeklyGrid } from '@/components/calendar/WeeklyGrid';

export const revalidate = 60;

export default async function HomePage() {
  const session = await auth();

  // If not authenticated, show sign-in prompt (don't redirect — let NavBar handle it)
  let events: ReturnType<typeof hyloEventToDisplayEvent>[] = [];

  if (session?.accessToken) {
    try {
      const raw = await getEvents(session.accessToken, LIMINAL_COMMONS_GROUP_ID);
      events = raw.map(hyloEventToDisplayEvent);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Failed to load events:', msg);
      // If Hylo rejected the token, force re-auth through gateway
      if (msg.includes('401')) {
        const gateway = process.env.NEXT_PUBLIC_AUTH_GATEWAY_URL || 'https://auth.castalia.one';
        redirect(`${gateway}/signin?callbackUrl=${encodeURIComponent('https://calendar.castalia.one')}`);
      }
    }
  }

  return (
    <div className="min-h-screen bg-grove-bg flex flex-col">
      <NavBar />
      <SubscribeBanner />
      <main className="flex-1 h-[calc(100vh-56px)]">
        <WeeklyGrid events={events} />
      </main>
    </div>
  );
}
