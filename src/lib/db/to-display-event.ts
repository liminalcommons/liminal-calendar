import type { DisplayEvent } from '../display-event';
import type { Event, Rsvp } from './schema';

/**
 * Extract a URL from text. Returns the first http(s) URL found, or null.
 */
function extractUrl(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"]+/);
  return match ? match[0] : null;
}

/**
 * Map a DB event row (with optional RSVPs) to the DisplayEvent interface
 * used by the UI components — no UI changes needed.
 *
 * `viewerIsHost`: caller has already determined the viewer is the event
 * host (events.member_id === viewer.id). Controls whether the
 * booker's note is included in the response — out of caution we don't
 * leak it to non-host viewers even if RSVP'd.
 */
export function dbEventToDisplayEvent(
  event: Event,
  rsvps: Rsvp[] = [],
  currentUserId?: string,
  viewerIsHost?: boolean,
): DisplayEvent {
  const goingCount = rsvps.filter((r) => r.status === 'yes').length;
  const interestedCount = rsvps.filter((r) => r.status === 'interested').length;

  // Find current user's RSVP
  const myRsvp = currentUserId
    ? rsvps.find((r) => r.userId === currentUserId)
    : undefined;
  const myResponse = myRsvp?.status === 'no' ? null : (myRsvp?.status ?? null);

  // Try to find a URL: first check location (if it looks like a URL), then description
  let eventUrl: string | null = null;
  if (event.location && /^https?:\/\//.test(event.location)) {
    eventUrl = event.location;
  } else {
    eventUrl = extractUrl(event.description);
  }

  return {
    id: String(event.id),
    title: event.title,
    description: event.description ?? null,
    starts_at: event.startsAt.toISOString(),
    ends_at: event.endsAt?.toISOString() ?? null,
    event_url: eventUrl,
    creator_id: event.creatorId,
    creator_name: event.creatorName,
    creator_image: event.creatorImage ?? undefined,
    timezone: event.timezone ?? 'UTC',
    location: event.location ?? null,
    myResponse,
    attendees: {
      total: rsvps.length,
      going: goingCount,
      interested: interestedCount,
    },
    imageUrl: event.imageUrl ?? undefined,
    recurrenceRule: event.recurrenceRule ?? undefined,
    sourceEventTypeId: event.sourceEventTypeId ?? null,
    cancelledAt: event.cancelledAt ? event.cancelledAt.toISOString() : null,
    cancellationReason: event.cancellationReason ?? null,
    noteFromBooker: viewerIsHost ? event.noteFromBooker ?? null : null,
  };
}
