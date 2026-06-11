import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { revalidateCalendarViews } from '@/lib/cache/revalidate-calendar-views';
import { canEditEvent, canDeleteEvent } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { events, rsvps, members } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
import { expandRecurringEvents } from '@/lib/recurrence-expander';
import { redactEventUrlForNonMembers, type DisplayEvent } from '@/lib/display-event';
import { and, eq } from 'drizzle-orm';
import {
  diffEventForNotification,
  fanoutEventChanged,
  fanoutEventCancelled,
} from '@/lib/notifications/fanout';
import { visibleEventsForMemberCondition, publicOnlyEventsCondition } from '@/lib/events/visibility';
import {
  validateInviteeCap,
  setEventInvitations,
  type Invitee,
} from '@/lib/events/invitations-repo';

/**
 * Split a (possibly suffixed) event id into its base numeric part and an
 * optional `YYYYMMDD` occurrence key. "41-20260524" → ["41", "20260524"];
 * "41" → ["41", null].
 */
function splitInstanceId(id: string): [string, string | null] {
  const m = id.match(/^(\d+)-(\d{8})$/);
  return m ? [m[1], m[2]] : [id, null];
}

/**
 * Resolve the specific occurrence's starts_at/ends_at for a recurring event,
 * delegating entirely to expandRecurringEvents so the timezone-deterministic
 * date math lives in exactly one place. Expands a window wide enough to contain
 * the requested date, then picks the instance whose id matches the suffix.
 * Returns null if the event isn't recurring or the occurrence can't be found.
 */
function resolveOccurrence(
  display: DisplayEvent,
  fullId: string,
  occurrenceSuffix: string,
): { starts_at: string; ends_at: string | null } | null {
  if (!display.recurrenceRule) return null;

  const year = Number(occurrenceSuffix.slice(0, 4));
  const month = Number(occurrenceSuffix.slice(4, 6));
  const day = Number(occurrenceSuffix.slice(6, 8));
  // Bracket the target day generously (UTC) so the occurrence falls inside the
  // range regardless of timezone offset. expandRecurringEvents tags each
  // instance id as `${baseId}-${YYYYMMDD}`.
  const rangeStart = new Date(Date.UTC(year, month - 1, day - 2));
  const rangeEnd = new Date(Date.UTC(year, month - 1, day + 2));

  const instances = expandRecurringEvents([display], rangeStart, rangeEnd);
  const match = instances.find((inst) => inst.id === fullId);
  return match ? { starts_at: match.starts_at, ends_at: match.ends_at } : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Recurring instances carry a `-YYYYMMDD` suffix (e.g. "41-20260524"); the
  // base row is keyed by the numeric prefix only. Split explicitly rather than
  // relying on parseInt truncation so the intent is obvious. `occurrenceSuffix`
  // is the 8-digit date key when this is a specific occurrence request, else null.
  const [baseIdPart, occurrenceSuffix] = splitInstanceId(id);
  const numId = parseInt(baseIdPart, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  try {
    const authed = await getAuthedUser();
    const visibilityCond = authed?.memberId
      ? visibleEventsForMemberCondition(authed.memberId)
      : publicOnlyEventsCondition();

    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, numId), visibilityCond));

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventRsvps = await db
      .select()
      .from(rsvps)
      .where(eq(rsvps.eventId, numId));

    const viewerIsHost = !!(authed?.memberId && event.memberId === authed.memberId);

    // Resolve cancelled-by member's display name for "cancelled by Alice" UI.
    let cancelledByName: string | null = null;
    if (event.cancelledByMemberId) {
      const [actor] = await db
        .select({ name: members.name })
        .from(members)
        .where(eq(members.id, event.cancelledByMemberId))
        .limit(1);
      cancelledByName = actor?.name ?? null;
    }

    const display = dbEventToDisplayEvent(event, eventRsvps, authed?.id, viewerIsHost);

    // For a recurring-instance request, the base row still holds the ORIGINAL
    // starts_at/ends_at. Override them with this specific occurrence's date by
    // reusing the calendar grid's expansion logic — never re-implementing the
    // timezone-sensitive date math (the expander is the single source of truth).
    const occurrence = occurrenceSuffix
      ? resolveOccurrence(display, id, occurrenceSuffix)
      : null;
    const resolved = occurrence
      ? { ...display, id, starts_at: occurrence.starts_at, ends_at: occurrence.ends_at }
      : display;

    // For recurring events, surface the next occurrences as a schedule. Expand
    // from the BASE projection (`display`, original starts_at) so the generated
    // ids are canonical `${baseId}-${YYYYMMDD}` instances. Window is [now, +10wk]
    // — wide enough for ~5-6 weekly occurrences; daily events overshoot, so cap
    // at the first 6 occurrences at or after `now`.
    let upcomingOccurrences:
      | { id: string; starts_at: string; ends_at: string | null }[]
      = [];
    if (display.recurrenceRule) {
      const now = new Date();
      const rangeEnd = new Date(now.getTime() + 70 * 86400000);
      upcomingOccurrences = expandRecurringEvents([display], now, rangeEnd)
        .filter((inst) => new Date(inst.starts_at) >= now)
        .slice(0, 6)
        .map((inst) => ({
          id: inst.id,
          starts_at: inst.starts_at,
          ends_at: inst.ends_at,
        }));
    }

    // Non-members can read public events but not their meeting links.
    const fenced = authed?.memberId ? resolved : redactEventUrlForNonMembers(resolved);

    return NextResponse.json({ ...fenced, cancelledByName, upcomingOccurrences });
  } catch (err) {
    console.error('[GET /api/events/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await getAuthedUser();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  const role = authed.role;

  // Fetch event to check ownership
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, numId));

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const isCreator = event.memberId !== null && event.memberId === authed.memberId;

  // Parse body once
  let bodyRaw: Record<string, unknown>;
  try {
    bodyRaw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const wantsInvitationEdit = Object.prototype.hasOwnProperty.call(bodyRaw, 'invitees');

  // For invitation edits: creator (any role) or admin may edit invitations.
  // For field edits: existing canEditEvent gate applies (creator who is host/admin).
  const hasFieldUpdates = Object.keys(bodyRaw).some((k) =>
    ['title', 'details', 'startTime', 'endTime', 'timezone', 'location', 'imageUrl', 'recurrenceRule', 'scope'].includes(k),
  );

  if (hasFieldUpdates && !canEditEvent(role, isCreator)) {
    return NextResponse.json(
      { error: 'Forbidden: insufficient permissions to edit this event' },
      { status: 403 },
    );
  }

  if (wantsInvitationEdit && !isCreator && role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: only the event creator or an admin can edit invitations' },
      { status: 403 },
    );
  }

  if (!hasFieldUpdates && !wantsInvitationEdit) {
    // Empty body with no recognized fields — fall through to no-op update.
    // Auth: if user is neither a field editor nor an invitation editor, reject.
    if (!canEditEvent(role, isCreator) && !isCreator && role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: insufficient permissions to edit this event' },
        { status: 403 },
      );
    }
  }

  const updates = bodyRaw;

  // Drag-to-reschedule sends `scope` to express the user's choice from the
  // RecurrenceMoveModal. Only `'all'` (or omitted = legacy edit-form) is
  // supported in v1. The other two are explicit 501s so a future client bug
  // that drops past the modal's disabled radios fails loud, not silent.
  // See: docs/superpowers/specs/2026-05-03-tz-fix-and-drag-reschedule-design.md
  if (updates.scope !== undefined) {
    if (updates.scope === 'this_only' || updates.scope === 'this_and_following') {
      return NextResponse.json(
        { error: `scope="${updates.scope}" is not implemented in v1; use "all" or omit.` },
        { status: 501 },
      );
    }
    if (updates.scope !== 'all') {
      return NextResponse.json(
        { error: `Invalid scope; expected "all", "this_only", "this_and_following", or omitted.` },
        { status: 400 },
      );
    }
    // scope === 'all' → fall through. The natural behavior of updating
    // events.startsAt/endsAt IS the all-instance shift, since
    // expandRecurringEvents uses the row as the rule template.
  }

  const setValues: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof updates.title === 'string') setValues.title = updates.title;
  if (typeof updates.details === 'string') setValues.description = updates.details;
  if (typeof updates.startTime === 'string') setValues.startsAt = new Date(updates.startTime);
  if (typeof updates.endTime === 'string') setValues.endsAt = new Date(updates.endTime);
  if (typeof updates.timezone === 'string') setValues.timezone = updates.timezone;
  if (typeof updates.location === 'string') setValues.location = updates.location;
  if (typeof updates.imageUrl === 'string') setValues.imageUrl = updates.imageUrl;
  if (typeof updates.recurrenceRule === 'string') setValues.recurrenceRule = updates.recurrenceRule;

  // Invitees cap validation (pure, before any DB write)
  let dedupedInvitees: Invitee[] | null = null;
  if (wantsInvitationEdit) {
    const rawInvitees = updates.invitees as Invitee[];
    try {
      dedupedInvitees = validateInviteeCap({ organizerRole: role, invitees: rawInvitees });
    } catch (capErr) {
      if ((capErr as Error).message === 'INVITEE_CAP_EXCEEDED') {
        return NextResponse.json(
          { error: 'Invitee cap exceeded: members may invite at most 10 people' },
          { status: 400 },
        );
      }
      throw capErr;
    }
  }

  try {
    const [updated] = await db
      .update(events)
      .set(setValues)
      .where(eq(events.id, numId))
      .returning();

    // Apply invitation replace-set if requested
    if (wantsInvitationEdit && dedupedInvitees !== null) {
      await setEventInvitations({
        eventId: numId,
        organizerRole: role,
        invitees: dedupedInvitees,
      });
    }

    // A3 fan-out: diff what materially changed and notify RSVPers (yes /
    // interested), excluding the editor themselves. Best-effort; never
    // fails the PATCH response.
    try {
      const diff = diffEventForNotification(event, updated);
      if (diff) {
        await fanoutEventChanged(db, updated, diff, { id: authed.id, name: authed.name });
      }
    } catch (fanoutErr) {
      console.error('[PATCH /api/events/[id]] fanout failed', fanoutErr);
    }

    const eventRsvps = await db
      .select()
      .from(rsvps)
      .where(eq(rsvps.eventId, numId));

    revalidateCalendarViews();

    return NextResponse.json(dbEventToDisplayEvent(updated, eventRsvps, authed.id));
  } catch (err) {
    console.error('[PATCH /api/events/[id]] update', err);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await getAuthedUser();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  const role = authed.role;

  // Fetch event to check ownership
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, numId));

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const isCreator = event.memberId !== null && event.memberId === authed.memberId;
  if (!canDeleteEvent(role, isCreator)) {
    return NextResponse.json(
      { error: 'Forbidden: insufficient permissions to delete this event' },
      { status: 403 },
    );
  }

  try {
    try {
      await fanoutEventCancelled(db, event, { id: authed.id, name: authed.name });
    } catch (fanoutErr) {
      console.error('[DELETE /api/events/[id]] fanout failed', fanoutErr);
    }

    await db.delete(events).where(eq(events.id, numId));

    revalidateCalendarViews();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/events/[id]] delete', err);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
