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

/**
 * Phase 3 — same logic as visibleEventsForUserCondition but anchored on
 * the canonical members.id integer FK. No provider-string OR-fan-out.
 *
 * Visible if any of:
 *   - events.visibility = 'public'
 *   - events.member_id = memberId             (creator)
 *   - rsvps.member_id  = memberId             (rsvp'd)
 *   - event_invitations.member_id = memberId  (invited)
 *
 * Rows whose member_id is NULL (legacy, pre-Phase-2 inserts) are
 * invisible by member_id alone — those are caught by the public branch
 * if applicable. Phase 2 dual-write + the Phase 1 backfill keep
 * coverage at ~100% on real data; only cron-driven and orphan rows
 * may be NULL.
 */
export function visibleEventsForMemberCondition(memberId: number): SQL {
  if (!memberId || memberId <= 0) {
    throw new Error('visibleEventsForMemberCondition: positive memberId is required');
  }
  return sql`(
    events.visibility = 'public'
    OR events.member_id = ${memberId}
    OR EXISTS (SELECT 1 FROM rsvps WHERE rsvps.event_id = events.id AND rsvps.member_id = ${memberId})
    OR EXISTS (SELECT 1 FROM event_invitations WHERE event_invitations.event_id = events.id AND event_invitations.member_id = ${memberId})
  )`;
}
