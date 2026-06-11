/**
 * WeeklyCalendarPage — the weekly-grid calendar as a server component, shared
 * by `/` (when the visitor is authed or a guest) and `/week` (always).
 * Members see their visibility tier; everyone else sees public events with
 * meeting links redacted (see redactEventUrlForNonMembers).
 */

import { getCurrentMember } from '@/lib/auth/get-current-member';
import type { AuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { events, rsvps, type Member } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
import { asc, inArray } from 'drizzle-orm';
import { addMonths } from 'date-fns';
import { NavBar } from '@/components/NavBar';
import { SubscribeBanner } from '@/components/SubscribeBanner';
import { AvailabilityBanner } from '@/components/availability/AvailabilityBanner';
import { WeeklyGrid } from '@/components/calendar/WeeklyGrid';
import { ClearGuestCookie } from '@/components/ClearGuestCookie';
import { BookingOnboardingNudge } from '@/components/booking/BookingOnboardingNudge';
import { YourBookingHomeBanner } from '@/components/booking/YourBookingHomeBanner';
import { expandRecurringEvents } from '@/lib/recurrence-expander';
import { visibleEventsForMemberCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';
import { redactEventUrlForNonMembers, type DisplayEvent } from '@/lib/display-event';

export async function WeeklyCalendarPage({ authed }: { authed: AuthedUser | null }) {
  const currentUserId = authed?.id;
  let member: Member | null = null;
  if (authed) {
    try {
      member = await getCurrentMember(db);
    } catch (err) {
      console.error('[WeeklyCalendarPage] getCurrentMember failed:', err instanceof Error ? err.message : String(err));
    }
  }
  const showBookingNudge = !!member && !member.handle;
  const memberHandle = member?.handle ?? null;

  let displayEvents: DisplayEvent[] = [];

  try {
    const visibilityCond = authed?.memberId
      ? visibleEventsForMemberCondition(authed.memberId)
      : publicOnlyEventsCondition();
    const allEvents = await db.select().from(events).where(visibilityCond).orderBy(asc(events.startsAt));

    // Fetch RSVPs only for the loaded events (not the whole table) — keeps the
    // home-page render cheap as the rsvps table grows. Mirrors /api/events.
    const eventIds = allEvents.map((e) => e.id);
    const allRsvps = eventIds.length > 0
      ? await db.select().from(rsvps).where(inArray(rsvps.eventId, eventIds))
      : [];

    // Group RSVPs by event ID
    const rsvpsByEvent = new Map<number, typeof allRsvps>();
    for (const rsvp of allRsvps) {
      const list = rsvpsByEvent.get(rsvp.eventId) ?? [];
      list.push(rsvp);
      rsvpsByEvent.set(rsvp.eventId, list);
    }

    const baseEvents = allEvents.map((event) =>
      dbEventToDisplayEvent(event, rsvpsByEvent.get(event.id) ?? [], currentUserId),
    );

    // Expand recurring events over a 6-month window
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // 1 month ago
    const rangeEnd = addMonths(now, 6);
    displayEvents = expandRecurringEvents(baseEvents, rangeStart, rangeEnd);
    // Non-members can read public events but not their meeting links — mirrors
    // the /api/events fence.
    if (!authed?.memberId) {
      displayEvents = displayEvents.map(redactEventUrlForNonMembers);
    }
  } catch (e) {
    console.error('Failed to load events:', e instanceof Error ? e.message : String(e));
  }

  return (
    <div className="h-screen bg-grove-bg flex flex-col overflow-hidden p-2 pt-0">
      {authed && <ClearGuestCookie />}
      <NavBar />
      <AvailabilityBanner />
      <SubscribeBanner />
      {showBookingNudge && <BookingOnboardingNudge />}
      {memberHandle && <YourBookingHomeBanner handle={memberHandle} />}
      <main className="flex-1 min-h-0 border border-grove-border rounded-lg overflow-hidden">
        <WeeklyGrid events={displayEvents} />
      </main>
    </div>
  );
}
