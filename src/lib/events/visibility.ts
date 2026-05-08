import { sql, type SQL } from 'drizzle-orm';

/**
 * SQL condition that selects events visible to a given user.
 * Visible if any of:
 *   - events.visibility = 'public'
 *   - events.creator_id = userId
 *   - userId has an RSVP for the event
 *   - userId has an invitation for the event
 *
 * Centralizing this predicate prevents drift across list endpoints.
 */
export function visibleEventsForUserCondition(userId: string): SQL {
  if (!userId) throw new Error('visibleEventsForUserCondition: userId is required');
  return sql`(
    events.visibility = 'public'
    OR events.creator_id = ${userId}
    OR EXISTS (SELECT 1 FROM rsvps WHERE rsvps.event_id = events.id AND rsvps.user_id = ${userId})
    OR EXISTS (SELECT 1 FROM event_invitations WHERE event_invitations.event_id = events.id AND event_invitations.invitee_user_id = ${userId})
  )`;
}

/**
 * Used when no user is signed in — only public events are visible.
 */
export function publicOnlyEventsCondition(): SQL {
  return sql`events.visibility = 'public'`;
}
