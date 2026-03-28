import type { HyloEvent } from '../types/hylo-types';

export interface DisplayEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string; // ISO
  ends_at: string | null;
  event_url: string | null;
  creator_id: string;
  creator_name: string;
  creator_image?: string;
  timezone: string;
  location: string | null;
  myResponse: string | null; // 'yes' | 'interested' | null
  attendees: { total: number; going: number; interested: number };
  imageUrl?: string;
  recurrenceRule?: string;
}

/**
 * Extract a URL from event details or location fields.
 * Returns the first http(s) URL found, or null.
 */
function extractUrl(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"]+/);
  return match ? match[0] : null;
}

/**
 * Map a HyloEvent to a DisplayEvent for the UI.
 */
export function hyloEventToDisplayEvent(event: HyloEvent): DisplayEvent {
  const invitations = event.eventInvitations?.items ?? [];
  const goingCount = invitations.filter(i => i.response === 'yes').length;
  const interestedCount = invitations.filter(i => i.response === 'interested').length;

  // Try to find a URL: first check location (if it looks like a URL), then details
  let eventUrl: string | null = null;
  if (event.location && /^https?:\/\//.test(event.location)) {
    eventUrl = event.location;
  } else {
    eventUrl = extractUrl(event.details);
  }

  return {
    id: event.id,
    title: event.title,
    description: event.details ?? null,
    starts_at: event.startTime,
    ends_at: event.endTime ?? null,
    event_url: eventUrl,
    creator_id: event.creator.id,
    creator_name: event.creator.name,
    creator_image: event.creator.avatarUrl,
    timezone: event.timezone ?? 'UTC',
    location: event.location ?? null,
    myResponse: event.myEventResponse ?? null,
    attendees: {
      total: event.eventInvitations?.total ?? 0,
      going: goingCount,
      interested: interestedCount,
    },
    imageUrl: event.imageUrl,
    recurrenceRule: undefined,
  };
}
