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
  /** Non-null when the event was created via the 1:1 booking flow.
   * Drives the cancel-booking affordance on /events/[id]. */
  sourceEventTypeId?: number | null;
  /** Soft-cancellation timestamp. null/undefined = active. */
  cancelledAt?: string | null;
  cancelledByName?: string | null;
  cancellationReason?: string | null;
  /** Note the booker wrote at booking time. Only included in the API
   * response when the viewer is the host (owner) — keeps it out of
   * cross-tenant peeks even if rendering happens to leak. */
  noteFromBooker?: string | null;
  /** True when the event HAS a meeting link but the viewer is not a member
   * (guest/anonymous), so `event_url` was stripped server-side. Lets the UI
   * render a "sign up to join" affordance without exposing the URL. */
  event_url_redacted?: boolean;
}

/** Server-side fence: strip the meeting link for non-member viewers while
 * signalling that one exists. Applied at every response boundary that can
 * serve anonymous/guest traffic (home SSR, /api/events, /api/events/[id]). */
export function redactEventUrlForNonMembers(event: DisplayEvent): DisplayEvent {
  if (!event.event_url) return event;
  return { ...event, event_url: null, event_url_redacted: true };
}
