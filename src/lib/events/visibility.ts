import { sql, type SQL } from 'drizzle-orm';

/**
 * SQL condition that selects events visible to a given user.
 * Visible if any of:
 *   - events.visibility = 'public'
 *   - events.visibility = 'members' (any authenticated member; Limicon tier —
 *     visible to all members, never to signed-out visitors)
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
    OR events.visibility = 'members'
    OR events.creator_id = ${userId}
    OR EXISTS (SELECT 1 FROM rsvps WHERE rsvps.event_id = events.id AND rsvps.user_id = ${userId})
    OR EXISTS (SELECT 1 FROM event_invitations WHERE event_invitations.event_id = events.id AND event_invitations.invitee_user_id = ${userId})
  ) AND (events.conference_id IS NULL OR NOT EXISTS (SELECT 1 FROM conferences c WHERE c.id = events.conference_id AND c.status = 'ended'))`;
}

/**
 * Lower date bound for the list/month/feed window.
 *
 * A naive `starts_at >= from` is WRONG for recurring events: their master row
 * stores the original anchor in `starts_at` (often months in the past), and
 * the client-side expander projects future occurrences forward from it. If the
 * master is filtered out by the lower bound it never reaches the expander, so
 * its ongoing occurrences silently vanish. This fired on the 2026-06-01 month
 * rollover — the rolling window start advanced from April 1 to May 1 and every
 * April-anchored weekly series disappeared from month + list views.
 *
 * Fix: exempt any row carrying a recurrence_rule from the lower bound. The
 * expander (capped, range-clipped) decides which occurrences actually render.
 */
export function eventsStartingOnOrAfter(from: Date): SQL {
  // Bind an ISO-8601 string, NOT the raw Date. Drizzle's sql`` tag has no
  // column-type context here, so a Date param is sent as its default
  // toString() ("Fri May 01 2026 ... (Coordinated Universal Time)"), which
  // Postgres cannot cast to timestamptz — the query 500s. (The typed `lte`
  // helper serializes correctly because it knows the column type; this raw
  // fragment does not.)
  return sql`(events.starts_at >= ${from.toISOString()} OR events.recurrence_rule IS NOT NULL)`;
}

/**
 * Used when no user is signed in — only public events are visible.
 * The 'members' tier (Limicon events) is deliberately excluded: members-only
 * means members-only, never anonymous.
 */
export function publicOnlyEventsCondition(): SQL {
  return sql`events.visibility = 'public' AND (events.conference_id IS NULL OR NOT EXISTS (SELECT 1 FROM conferences c WHERE c.id = events.conference_id AND c.status = 'ended'))`;
}

/**
 * Phase 3 — same logic as visibleEventsForUserCondition but anchored on
 * the canonical members.id integer FK. No provider-string OR-fan-out.
 *
 * Visible if any of:
 *   - events.visibility = 'public'
 *   - events.visibility = 'members' (any authenticated member)
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
    OR events.visibility = 'members'
    OR events.member_id = ${memberId}
    OR EXISTS (SELECT 1 FROM rsvps WHERE rsvps.event_id = events.id AND rsvps.member_id = ${memberId})
    OR EXISTS (SELECT 1 FROM event_invitations WHERE event_invitations.event_id = events.id AND event_invitations.member_id = ${memberId})
  ) AND (events.conference_id IS NULL OR NOT EXISTS (SELECT 1 FROM conferences c WHERE c.id = events.conference_id AND c.status = 'ended'))`;
}

/**
 * Expired-conference exclusion. Events still linked to an `ended` conference
 * are invisible everywhere — that is what "the Limicon calendar disappears"
 * means at the query layer. Retained events (conference_id cleared on
 * transfer) are unaffected, and NULL-conference rows never match the
 * subquery. Apply to EVERY event list query, signed-in or not.
 */
export function activeConferenceCondition(): SQL {
  return sql`(events.conference_id IS NULL OR NOT EXISTS (SELECT 1 FROM conferences c WHERE c.id = events.conference_id AND c.status = 'ended'))`;
}

/**
 * Conference scope for /c/[slug] views: the conference's own events plus
 * permanent-calendar public events in the window (this is the "absorption":
 * existing Liminal events show up on Limicon with no backfill). Other
 * conferences' members-events stay out. Combine with the date window and the
 * viewer visibility predicate, exactly like the permanent views.
 */
export function conferenceScopeCondition(conferenceId: number): SQL {
  if (!conferenceId || conferenceId <= 0) {
    throw new Error('conferenceScopeCondition: positive conferenceId is required');
  }
  return sql`((events.conference_id = ${conferenceId}) OR (events.conference_id IS NULL AND events.visibility = 'public'))`;
}
