/**
 * GET /api/booking/[handle]/[slug]/slots — Task 5 of Plan 3 (1:1 Booking).
 *
 * Returns the available slots for `[handle]`'s `[slug]` event-type over
 * the configured horizon (`maxDaysAhead`), respecting `minNoticeMinutes`
 * and per-slot buffers via the pure `computeSlots` engine.
 *
 * Auth: must be signed in (`getCurrentMember`). We don't surface the
 * booker's identity to the engine — we only use the auth check to gate
 * the endpoint, matching plan-3 Q-policy: "auth-gated, signed-in only".
 *
 * Blocking: filters `events.memberId === ownerMemberId` only. Per spec
 * Q7=C, RSVPs DO NOT block the host's availability.
 *
 * Next.js 15: `params` is async, must be awaited.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, members } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { resolveHandleToMemberId } from '@/lib/booking/handle-resolver';
import { getEventTypeBySlug } from '@/lib/booking/event-types-repo';
import { availabilityToWindows } from '@/lib/booking/availability-to-windows';
import { computeSlots } from '@/lib/booking/slots';

const MS_PER_DAY = 86_400_000;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ handle: string; slug: string }> },
) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { handle, slug } = await context.params;

  const ownerMemberId = await resolveHandleToMemberId(handle);
  if (ownerMemberId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const eventType = await getEventTypeBySlug(ownerMemberId, slug);
  if (!eventType) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Bookable hours = the owner's `members.availability` half-hour heatmap,
  // set in /profile. Single source of truth — same data the WeeklyGrid
  // heatmap reads.
  const [ownerRow] = await db
    .select({ availability: members.availability, timezone: members.timezone })
    .from(members)
    .where(eq(members.id, ownerMemberId))
    .limit(1);

  let availSlots: number[] = [];
  if (ownerRow?.availability) {
    try {
      const parsed = JSON.parse(ownerRow.availability);
      if (Array.isArray(parsed)) availSlots = parsed.filter((n) => Number.isInteger(n));
    } catch {
      availSlots = [];
    }
  }
  const windows = availabilityToWindows(availSlots, ownerRow?.timezone ?? 'UTC');

  const now = new Date();
  const horizon = new Date(now.getTime() + eventType.maxDaysAhead * MS_PER_DAY);

  // Blocking events: anything the owner is creator/host of inside the
  // horizon. We pass start+end to the engine; null end → engine treats
  // as start + duration. RSVPs are intentionally NOT queried.
  const blockingRows = await db
    .select({ startsAt: events.startsAt, endsAt: events.endsAt })
    .from(events)
    .where(
      and(
        eq(events.memberId, ownerMemberId),
        gte(events.startsAt, now),
        lte(events.startsAt, horizon),
      ),
    );

  const slots = computeSlots({
    now,
    eventType: {
      durationMinutes: eventType.durationMinutes,
      bufferBeforeMinutes: eventType.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: eventType.bufferAfterMinutes ?? 0,
      minNoticeMinutes: eventType.minNoticeMinutes ?? 0,
      maxDaysAhead: eventType.maxDaysAhead,
    },
    windows,
    blockingEvents: blockingRows.map((r) => ({
      startsAt: r.startsAt instanceof Date ? r.startsAt : new Date(r.startsAt),
      endsAt: r.endsAt ? (r.endsAt instanceof Date ? r.endsAt : new Date(r.endsAt)) : null,
    })),
  });

  return NextResponse.json({
    eventType: {
      id: eventType.id,
      title: eventType.title,
      durationMinutes: eventType.durationMinutes,
      locationKind: eventType.locationKind,
    },
    slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString() })),
  });
}
