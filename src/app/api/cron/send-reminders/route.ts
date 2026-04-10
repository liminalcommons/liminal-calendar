import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, rsvps, members, notificationLog } from '@/lib/db/schema';
import { and, eq, gte, lte, not, inArray } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { buildReminderEmail, type ReminderType } from '@/lib/notifications/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const WINDOWS: [ReminderType, number, number][] = [
  ['24hr', 1435, 1445], // 23h55m to 24h05m
  ['1hr', 55, 65], // 55m to 1h05m
  ['15min', 10, 20], // 10m to 20m
];

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

  for (const [type, minMin, maxMin] of WINDOWS) {
    const windowStart = new Date(now.getTime() + minMin * 60_000);
    const windowEnd = new Date(now.getTime() + maxMin * 60_000);

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

  return NextResponse.json({ sent, skipped, errors, timestamp: now.toISOString() });
}
