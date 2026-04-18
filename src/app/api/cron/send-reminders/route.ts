import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, rsvps, members, notificationLog } from '@/lib/db/schema';
import { and, eq, gte, lte, not, inArray } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { buildReminderEmail, type ReminderType } from '@/lib/notifications/reminders';
import { sendPushToUsers } from '@/lib/notifications/push';

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

  // Push notifications: 1h, 15min, and at-start windows
  // Dedupe via notificationLog with distinct 'push-*' type values so email logs don't collide
  const PUSH_WINDOWS: { type: string; minMin: number; maxMin: number; title: (t: string) => string; body: string }[] = [
    { type: 'push-1hr',   minMin: 55, maxMin: 65, title: (t) => `${t} — in 1 hour`,     body: 'Starts in about 1 hour. Tap to view.' },
    { type: 'push-15min', minMin: 10, maxMin: 20, title: (t) => `${t} — starting soon`, body: 'Starts in 15 minutes. Tap to join.' },
    { type: 'push-start', minMin: 0,  maxMin: 10, title: (t) => `${t} — starting now`,  body: 'Starting now. Tap to join.' },
  ];

  let pushSent = 0;

  for (const w of PUSH_WINDOWS) {
    const windowStart = new Date(now.getTime() + w.minMin * 60_000);
    const windowEnd = new Date(now.getTime() + w.maxMin * 60_000);

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
    const sentPushSet = new Set(alreadySentPush.map((s) => `${s.eventId}:${s.userId}`));

    // Group by event, filtering out already-sent user/event pairs
    const eventMap = new Map<number, { title: string; location: string | null; description: string | null; userIds: string[] }>();
    for (const e of due) {
      if (sentPushSet.has(`${e.eventId}:${e.userId}`)) continue;
      const existing = eventMap.get(e.eventId);
      if (existing) {
        existing.userIds.push(e.userId);
      } else {
        eventMap.set(e.eventId, { title: e.title, location: e.location, description: e.description, userIds: [e.userId] });
      }
    }

    for (const [eventId, info] of eventMap) {
      const text = `${info.location || ''} ${info.description || ''}`;
      const linkMatch = text.match(/https?:\/\/[^\s<"]+/);
      const url = linkMatch ? linkMatch[0] : `https://calendar.castalia.one/events/${eventId}`;

      const result = await sendPushToUsers(info.userIds, {
        title: w.title(info.title),
        body: w.body,
        url,
        tag: `event-${eventId}-${w.type}`,
      });
      pushSent += result.sent;

      // Log each successful recipient so we don't re-send in the next cron tick within the same window
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
