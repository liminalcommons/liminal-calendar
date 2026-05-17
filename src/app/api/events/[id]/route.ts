import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { canEditEvent, canDeleteEvent } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
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

    return NextResponse.json(dbEventToDisplayEvent(event, eventRsvps, authed?.id));
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

    revalidatePath('/');
    revalidatePath('/list');
    revalidatePath('/month');

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

    revalidatePath('/');
    revalidatePath('/list');
    revalidatePath('/month');

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/events/[id]] delete', err);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
