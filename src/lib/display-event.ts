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
}
