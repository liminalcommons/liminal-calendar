import { auth } from '../../auth';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
import { asc } from 'drizzle-orm';
import { NavBar } from '@/components/NavBar';
import { SubscribeBanner } from '@/components/SubscribeBanner';
import { WeeklyGrid } from '@/components/calendar/WeeklyGrid';
import type { DisplayEvent } from '@/lib/display-event';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();
  const currentUserId = (session?.user as any)?.hyloId as string | undefined;

  let displayEvents: DisplayEvent[] = [];

  try {
    const allEvents = await db.select().from(events).orderBy(asc(events.startsAt));

    // Fetch all RSVPs in one query
    const allRsvps = allEvents.length > 0
      ? await db.select().from(rsvps)
      : [];

    // Group RSVPs by event ID
    const rsvpsByEvent = new Map<number, typeof allRsvps>();
    for (const rsvp of allRsvps) {
      const list = rsvpsByEvent.get(rsvp.eventId) ?? [];
      list.push(rsvp);
      rsvpsByEvent.set(rsvp.eventId, list);
    }

    displayEvents = allEvents.map((event) =>
      dbEventToDisplayEvent(event, rsvpsByEvent.get(event.id) ?? [], currentUserId),
    );
  } catch (e) {
    console.error('Failed to load events:', e instanceof Error ? e.message : String(e));
  }

  return (
    <div className="h-screen bg-grove-bg flex flex-col overflow-hidden">
      <NavBar />
      <SubscribeBanner />
      <main className="flex-1 min-h-0">
        <WeeklyGrid events={displayEvents} />
      </main>
    </div>
  );
}
