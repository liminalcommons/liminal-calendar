/**
 * POST /api/booking/[handle]/[slug]/book — Task 6 of Plan 3 (1:1 Booking).
 *
 * The booking endpoint. Atomic-ish across:
 *   1. events row (visibility=private, sourceEventTypeId set)
 *   2. 2 rsvps rows (owner=yes, booker=yes) — dual-write
 *   3. 2 booking.confirmed notifications (owner + booker)
 *
 * neon-http has no `db.transaction()`. Inserts are sequential. If a later
 * insert fails, earlier rows persist (a known project-wide constraint).
 *
 * Slot re-validation: we re-run `computeSlots(...)` with the exact same
 * inputs the slots-endpoint uses, and require the requested startsAt to
 * match one of the engine's outputs (millisecond-precise). This is the
 * race-safety check — between the GET /slots and the POST /book, the
 * owner may have created a conflicting event.
 *
 * Auth: `getCurrentMember(db)`. Self-booking (booker === owner) is 400.
 *
 * Next.js 15: `params` is async; await it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, rsvps, members } from '@/lib/db/schema';
import { revalidateCalendarViews } from '@/lib/cache/revalidate-calendar-views';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { resolveHandleToMemberId } from '@/lib/booking/handle-resolver';
import { getEventTypeBySlug } from '@/lib/booking/event-types-repo';
import { availabilityToWindows } from '@/lib/booking/availability-to-windows';
import { computeSlots } from '@/lib/booking/slots';
import { mintCastaliaRoomUrl } from '@/lib/booking/castalia-room';
import { createNotification } from '@/lib/notifications/inbox/repo';
import { sendEmail } from '@/lib/email';
import { buildBookingConfirmedEmail } from '@/lib/notifications/booking-emails';

const MS_PER_DAY = 86_400_000;

const BookInput = z.object({
  startsAt: z.string().datetime(),
  // Optional note from booker to host. Trimmed + bounded so a giant
  // pasted blob doesn't blow up the email or break formatting.
  note: z.string().trim().max(2000).optional(),
});

/** Resolve a Member to a legacy provider-string id (logto > clerk > fallback). */
function legacyIdFor(m: {
  id: number;
  logtoId: string | null;
  clerkId: string | null;
}): string {
  return m.logtoId ?? m.clerkId ?? String(m.id);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ handle: string; slug: string }> },
) {
  const bookerMember = await getCurrentMember(db);
  if (!bookerMember) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BookInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body: startsAt must be ISO datetime' }, { status: 400 });
  }
  const requestedStart = new Date(parsed.data.startsAt);

  const { handle, slug } = await context.params;

  const ownerMemberId = await resolveHandleToMemberId(handle);
  if (ownerMemberId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (ownerMemberId === bookerMember.id) {
    return NextResponse.json({ error: 'Cannot book yourself' }, { status: 400 });
  }

  const et = await getEventTypeBySlug(ownerMemberId, slug);
  if (!et) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Slot re-validation reads owner's availability heatmap (same source as
  // GET /slots and the /profile editor — keep them in sync).
  const [ownerRow] = await db
    .select({ availability: members.availability, timezone: members.timezone })
    .from(members)
    .where(eq(members.id, ownerMemberId))
    .limit(1);

  let availSlots: number[] = [];
  if (ownerRow?.availability) {
    try {
      const parsedAvail = JSON.parse(ownerRow.availability);
      if (Array.isArray(parsedAvail)) availSlots = parsedAvail.filter((n) => Number.isInteger(n));
    } catch {
      availSlots = [];
    }
  }
  const windows = availabilityToWindows(availSlots, ownerRow?.timezone ?? 'UTC');
  const now = new Date();
  const horizon = new Date(now.getTime() + et.maxDaysAhead * MS_PER_DAY);
  const blockingRows = await db
    .select({ startsAt: events.startsAt, endsAt: events.endsAt })
    .from(events)
    .where(
      and(
        eq(events.memberId, ownerMemberId),
        gte(events.startsAt, now),
        lte(events.startsAt, horizon),
        isNull(events.cancelledAt),
      ),
    );

  const computed = computeSlots({
    now,
    eventType: {
      durationMinutes: et.durationMinutes,
      bufferBeforeMinutes: et.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: et.bufferAfterMinutes ?? 0,
      minNoticeMinutes: et.minNoticeMinutes ?? 0,
      maxDaysAhead: et.maxDaysAhead,
    },
    windows,
    blockingEvents: (blockingRows as Array<{ startsAt: Date | string; endsAt: Date | string | null }>).map(
      (r) => ({
        startsAt: r.startsAt instanceof Date ? r.startsAt : new Date(r.startsAt),
        endsAt: r.endsAt ? (r.endsAt instanceof Date ? r.endsAt : new Date(r.endsAt)) : null,
      }),
    ),
  });

  const requestedMs = requestedStart.getTime();
  const matched = computed.find((s) => s.startsAt.getTime() === requestedMs);
  if (!matched) {
    return NextResponse.json(
      { error: 'Requested slot is no longer available' },
      { status: 409 },
    );
  }

  // Owner Member lookup — need name/image for denormalized event columns.
  const [ownerMember] = await db
    .select()
    .from(members)
    .where(eq(members.id, ownerMemberId))
    .limit(1);
  if (!ownerMember) {
    return NextResponse.json({ error: 'Owner not found' }, { status: 404 });
  }

  // Location resolution.
  let location: string | null;
  if (et.locationKind === 'castalia') {
    location = await mintCastaliaRoomUrl({
      ownerId: ownerMember.id,
      bookerId: bookerMember.id,
    });
  } else {
    location = et.locationValue ?? null;
  }

  const endsAt = new Date(requestedMs + et.durationMinutes * 60_000);
  const ownerLegacyId = legacyIdFor(ownerMember);
  const bookerLegacyId = legacyIdFor(bookerMember);

  // 1. Insert event row.
  // Race-safety: a partial unique index `events_booking_owner_starts_unique`
  // on (member_id, starts_at) WHERE source_event_type_id IS NOT NULL turns
  // a concurrent double-book into a Postgres unique violation (SQLSTATE
  // 23505). We catch it and return 409, mirroring the slot-already-taken
  // path above. Without this, two simultaneous bookers can both pass
  // computeSlots() (since neither has inserted yet) and create duplicate
  // events for the same owner+time.
  const note = parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null;

  let createdEvent: { id: number };
  try {
    [createdEvent] = await db
      .insert(events)
      .values({
        title: et.title,
        description: et.description ?? null,
        startsAt: requestedStart,
        endsAt,
        timezone: 'UTC',
        location,
        creatorId: ownerLegacyId,
        memberId: ownerMember.id,
        creatorName: ownerMember.name ?? 'Unknown',
        creatorImage: ownerMember.image ?? null,
        visibility: 'private',
        sourceEventTypeId: et.id,
        noteFromBooker: note,
      })
      .returning();
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    const msg = String((err as { message?: string } | null)?.message ?? '');
    if (code === '23505' || msg.includes('events_booking_owner_starts_unique')) {
      return NextResponse.json(
        { error: 'Requested slot is no longer available' },
        { status: 409 },
      );
    }
    throw err;
  }

  const eventId = createdEvent.id;

  // 2. Insert RSVPs (owner + booker, both = yes). Best-effort sequential.
  await db.insert(rsvps).values({
    eventId,
    userId: ownerLegacyId,
    memberId: ownerMember.id,
    userName: ownerMember.name ?? 'Unknown',
    userImage: ownerMember.image ?? null,
    status: 'yes',
  });

  await db.insert(rsvps).values({
    eventId,
    userId: bookerLegacyId,
    memberId: bookerMember.id,
    userName: bookerMember.name ?? 'Unknown',
    userImage: bookerMember.image ?? null,
    status: 'yes',
  });

  // 3. Booking-confirmed inbox notifications (owner + booker).
  // Best-effort: log but don't fail the response if fan-out misfires.
  const startsAtIso = requestedStart.toISOString();
  const payload = { startsAt: startsAtIso, location, note };
  const ownerTitle = `${et.title} booked by ${bookerMember.name ?? 'Someone'}`;
  const bookerTitle = `${et.title} booked with ${ownerMember.name ?? 'host'}`;
  const url = `/events/${eventId}`;

  try {
    await createNotification(db, {
      userId: ownerLegacyId,
      memberId: ownerMember.id,
      type: 'booking.confirmed',
      eventId,
      actorId: bookerLegacyId,
      actorMemberId: bookerMember.id,
      actorName: bookerMember.name ?? null,
      title: ownerTitle,
      url,
      payload,
    });
  } catch (err) {
    console.error('[POST /api/booking/book] owner notification failed', err);
  }

  try {
    await createNotification(db, {
      userId: bookerLegacyId,
      memberId: bookerMember.id,
      type: 'booking.confirmed',
      eventId,
      actorId: ownerLegacyId,
      actorMemberId: ownerMember.id,
      actorName: ownerMember.name ?? null,
      title: bookerTitle,
      url,
      payload,
    });
  } catch (err) {
    console.error('[POST /api/booking/book] booker notification failed', err);
  }

  // 4. Transactional emails (owner + booker). Booking confirmations are
  // not gated on notification_preferences — those control recurring
  // reminders. The first "you have a meeting" message is a one-time
  // transactional notice that always sends when we have an address.
  const ownerName = ownerMember.name ?? 'host';
  const bookerName = bookerMember.name ?? 'someone';
  const eventTimezone = 'UTC';

  if (ownerMember.email) {
    try {
      const { subject, html } = buildBookingConfirmedEmail({
        flavor: 'owner',
        eventId,
        eventTitle: et.title,
        startsAt: requestedStart,
        endsAt,
        location,
        ownerName,
        bookerName,
        recipientTimezone: ownerMember.timezone ?? eventTimezone,
        eventTimezone,
        noteFromBooker: note,
      });
      const result = await sendEmail(ownerMember.email, subject, html);
      if (!result.success) {
        console.error('[POST /api/booking/book] owner email failed', result.error);
      }
    } catch (err) {
      console.error('[POST /api/booking/book] owner email threw', err);
    }
  }

  if (bookerMember.email) {
    try {
      const { subject, html } = buildBookingConfirmedEmail({
        flavor: 'booker',
        eventId,
        eventTitle: et.title,
        startsAt: requestedStart,
        endsAt,
        location,
        ownerName,
        bookerName,
        recipientTimezone: bookerMember.timezone ?? eventTimezone,
        eventTimezone,
      });
      const result = await sendEmail(bookerMember.email, subject, html);
      if (!result.success) {
        console.error('[POST /api/booking/book] booker email failed', result.error);
      }
    } catch (err) {
      console.error('[POST /api/booking/book] booker email threw', err);
    }
  }

  // A successful booking writes an event into the owner's calendar AND
  // burns one slot on the public picker. Invalidate both.
  revalidateCalendarViews();
  revalidatePath(`/${handle}/${slug}`);
  revalidatePath(`/${handle}`);

  return NextResponse.json(
    {
      id: eventId,
      startsAt: startsAtIso,
      endsAt: endsAt.toISOString(),
      location,
      title: et.title,
    },
    { status: 201 },
  );
}
