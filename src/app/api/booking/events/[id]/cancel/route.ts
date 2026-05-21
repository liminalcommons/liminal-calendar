/**
 * PATCH /api/booking/events/[id]/cancel — soft-cancel a booking-created
 * event (sourceEventTypeId IS NOT NULL).
 *
 * Auth: caller must be either
 *   (a) the event's host — events.member_id === caller.member.id, or
 *   (b) the booker — has a yes-rsvp on the event for caller.member.id.
 *
 * Idempotent: cancelling an already-cancelled event returns 200 with the
 * existing cancellation row; we don't re-fire emails.
 *
 * Past events cannot be cancelled (use "mark as no-show" semantics later
 * if needed). Manual (non-booking) events are out of scope here.
 *
 * Side effects on first cancel:
 *   - sets cancelled_at, cancelled_by_member_id, cancellation_reason
 *   - sends "cancelled" emails to both parties (when an address exists)
 *   - inserts inbox notifications for both parties
 *   - revalidates calendar views and the public booking page
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, rsvps, members } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { createNotification } from '@/lib/notifications/inbox/repo';
import { sendEmail } from '@/lib/email';
import { buildBookingCancelledEmail } from '@/lib/notifications/booking-emails';
import { revalidateCalendarViews } from '@/lib/cache/revalidate-calendar-views';

const Input = z.object({
  reason: z.string().trim().max(2000).optional(),
});

function legacyIdFor(m: {
  id: number;
  logtoId: string | null;
  clerkId: string | null;
}): string {
  return m.logtoId ?? m.clerkId ?? String(m.id);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const callerOrNull = await getCurrentMember(db);
  if (!callerOrNull) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const caller = callerOrNull;

  const { id: rawId } = await context.params;
  const eventId = Number.parseInt(rawId, 10);
  if (!Number.isFinite(eventId) || eventId <= 0) {
    return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — reason is optional
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const reason =
    parsed.data.reason && parsed.data.reason.length > 0 ? parsed.data.reason : null;

  // Load event.
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (event.sourceEventTypeId === null) {
    return NextResponse.json(
      { error: 'Only booking-created events can be cancelled here' },
      { status: 400 },
    );
  }

  // Authorization: host or booker.
  const isHost = event.memberId === caller.id;
  let isBooker = false;
  if (!isHost) {
    const [rsvp] = await db
      .select({ id: rsvps.id })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.memberId, caller.id)))
      .limit(1);
    isBooker = !!rsvp;
  }
  if (!isHost && !isBooker) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Idempotent: already cancelled → 200 with current state.
  if (event.cancelledAt) {
    return NextResponse.json({
      id: event.id,
      cancelledAt: event.cancelledAt,
      cancelledByMemberId: event.cancelledByMemberId,
      cancellationReason: event.cancellationReason,
      alreadyCancelled: true,
    });
  }

  // Past events: don't allow cancellation through this endpoint.
  const startsAtDate = event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt);
  if (startsAtDate.getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'Cannot cancel a meeting that already started' },
      { status: 400 },
    );
  }

  // Mark cancelled.
  const cancelledAt = new Date();
  await db
    .update(events)
    .set({
      cancelledAt,
      cancelledByMemberId: caller.id,
      cancellationReason: reason,
      updatedAt: sql`NOW()`,
    })
    .where(eq(events.id, eventId));

  // Load host + booker member rows for emails + notifications.
  const [hostMember] = event.memberId
    ? await db.select().from(members).where(eq(members.id, event.memberId)).limit(1)
    : [null];

  const rsvpRows = await db
    .select({ memberId: rsvps.memberId, userId: rsvps.userId })
    .from(rsvps)
    .where(eq(rsvps.eventId, eventId));
  // Booker = the non-host attendee. There may be more in odd cases (e.g.
  // host invited an extra) but we only treat the first non-host as the
  // canonical booker for cancellation routing.
  const bookerRsvp = rsvpRows.find((r) => r.memberId !== event.memberId);
  const [bookerMember] = bookerRsvp?.memberId
    ? await db.select().from(members).where(eq(members.id, bookerRsvp.memberId)).limit(1)
    : [null];

  const startsAtIso = startsAtDate.toISOString();
  const cancellerName = caller.name ?? 'Someone';
  const callerLegacyId = legacyIdFor(caller);

  // Per-recipient fan-out: inbox + email each, best-effort.
  async function notify(
    recipientMember: typeof hostMember,
    flavor: 'host' | 'booker',
  ): Promise<void> {
    if (!recipientMember) return;
    const recipientLegacyId = legacyIdFor(recipientMember);
    const recipientIsCanceller = recipientMember.id === caller.id;
    const title = recipientIsCanceller
      ? `You cancelled ${event.title}`
      : `${cancellerName} cancelled ${event.title}`;

    try {
      await createNotification(db, {
        userId: recipientLegacyId,
        memberId: recipientMember.id,
        type: 'booking.cancelled',
        eventId,
        actorId: callerLegacyId,
        actorMemberId: caller.id,
        actorName: caller.name ?? null,
        title,
        url: `/events/${eventId}`,
        payload: { startsAt: startsAtIso, reason, cancelledByMemberId: caller.id },
      });
    } catch (err) {
      console.error(`[cancel] ${flavor} inbox failed`, err);
    }

    if (recipientMember.email) {
      try {
        const { subject, html } = buildBookingCancelledEmail({
          flavor,
          eventId,
          eventTitle: event.title,
          startsAt: startsAtDate,
          recipientTimezone: recipientMember.timezone ?? 'UTC',
          eventTimezone: event.timezone ?? 'UTC',
          cancellerName: caller.name ?? 'Someone',
          recipientIsCanceller,
          reason,
        });
        const result = await sendEmail(recipientMember.email, subject, html);
        if (!result.success) {
          console.error(`[cancel] ${flavor} email failed`, result.error);
        }
      } catch (err) {
        console.error(`[cancel] ${flavor} email threw`, err);
      }
    }
  }

  await notify(hostMember, 'host');
  await notify(bookerMember, 'booker');

  revalidateCalendarViews();
  revalidatePath(`/events/${eventId}`);
  revalidatePath('/book');

  return NextResponse.json({
    id: eventId,
    cancelledAt: cancelledAt.toISOString(),
    cancelledByMemberId: caller.id,
    cancellationReason: reason,
  });
}
