import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, rsvps, members, notificationLog } from '@/lib/db/schema';
import { and, eq, gte, lte, not, inArray } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { buildReminderEmail, type ReminderType } from '@/lib/notifications/reminders';
import { sendPushToUsers } from '@/lib/notifications/push';
import {
  computeReminderWindow,
  filterUnsentRecipients,
  groupPushRecipientsByEvent,
  pickPushClickUrl,
  PUSH_WINDOWS,
  EMAIL_WINDOWS,
} from '@/lib/notifications/reminder-dispatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const [typeStr, minMin, maxMin] of EMAIL_WINDOWS) {
    const type = typeStr as ReminderType;
    const { windowStart, windowEnd } = computeReminderWindow(now, minMin, maxMin);

    // Find events in window with opted-in RSVPs
    const dueEvents = await db
      .select({
        eventId: events.id,
        title: events.title,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        location: events.location,
        description: events.description,
        eventTimezone: events.timezone,
        userId: rsvps.userId,
      })
      .from(events)
      .innerJoin(
        rsvps,
        and(eq(rsvps.eventId, events.id), eq(rsvps.remindMe, true), not(eq(rsvps.status, 'no'))),
      )
      .where(and(gte(events.startsAt, windowStart), lte(events.startsAt, windowEnd)));

    if (dueEvents.length === 0) continue;

    // Check which have already been sent for this reminder type
    const alreadySent = await db
      .select({ eventId: notificationLog.eventId, userId: notificationLog.userId })
      .from(notificationLog)
      .where(eq(notificationLog.type, type));

    const sentSet = new Set(alreadySent.map((s) => `${s.eventId}:${s.userId}`));

    // Gather member emails + timezones
    const userIds = [...new Set(dueEvents.map((e) => e.userId))];
    const memberRows =
      userIds.length > 0
        ? await db
            .select({ hyloId: members.hyloId, email: members.email, timezone: members.timezone })
            .from(members)
            .where(inArray(members.hyloId, userIds))
        : [];
    const memberMap = new Map(memberRows.map((m) => [m.hyloId, m]));

    for (const due of dueEvents) {
      const key = `${due.eventId}:${due.userId}`;
      if (sentSet.has(key)) {
        skipped++;
        continue;
      }

      const member = memberMap.get(due.userId);
      if (!member?.email) {
        skipped++;
        continue;
      }

      const { subject, html } = buildReminderEmail(
        type,
        {
          id: due.eventId,
          title: due.title,
          startsAt: due.startsAt,
          endsAt: due.endsAt ?? null,
          location: due.location ?? null,
          description: due.description ?? null,
          timezone: due.eventTimezone ?? 'UTC',
        },
        {
          userId: due.userId,
          email: member.email,
          timezone: member.timezone ?? 'UTC',
        },
      );

      const result = await sendEmail(member.email, subject, html);

      if (result.success) {
        await db
          .insert(notificationLog)
          .values({
            eventId: due.eventId,
            userId: due.userId,
            type,
          })
          .onConflictDoNothing();
        sent++;
      } else {
        console.error(
          `[send-reminders] Failed for ${due.userId} event ${due.eventId}: ${result.error}`,
        );
        errors++;
      }
    }
  }

  let pushSent = 0;

  for (const w of PUSH_WINDOWS) {
    const { windowStart, windowEnd } = computeReminderWindow(now, w.minMin, w.maxMin);

    const due = await db
      .select({
        eventId: events.id,
        title: events.title,
        startsAt: events.startsAt,
        location: events.location,
        description: events.description,
        userId: rsvps.userId,
      })
      .from(events)
      .innerJoin(
        rsvps,
        and(eq(rsvps.eventId, events.id), eq(rsvps.remindMe, true), not(eq(rsvps.status, 'no'))),
      )
      .where(and(gte(events.startsAt, windowStart), lte(events.startsAt, windowEnd)));

    if (due.length === 0) continue;

    const alreadySentPush = await db
      .select({ eventId: notificationLog.eventId, userId: notificationLog.userId })
      .from(notificationLog)
      .where(eq(notificationLog.type, w.type));
    const unsent = filterUnsentRecipients(due, alreadySentPush);
    const eventMap = groupPushRecipientsByEvent(unsent);

    for (const [eventId, info] of eventMap) {
      const url = pickPushClickUrl(eventId, info.location, info.description);
      const result = await sendPushToUsers(info.userIds, {
        title: w.title(info.title),
        body: w.body,
        url,
        tag: `event-${eventId}-${w.type}`,
      });
      pushSent += result.sent;

      if (result.sent > 0) {
        await db
          .insert(notificationLog)
          .values(info.userIds.map((uid) => ({ eventId, userId: uid, type: w.type })))
          .onConflictDoNothing();
      }
    }
  }

  return NextResponse.json({ sent, skipped, errors, pushSent, timestamp: now.toISOString() });
}
