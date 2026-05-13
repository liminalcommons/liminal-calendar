import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  events,
  rsvps,
  members,
  notificationLog,
  notificationPreferences,
  attendanceReports,
} from '@/lib/db/schema';
import { and, eq, gte, lte, not, inArray, or, sql } from 'drizzle-orm';
import { WINDOW_TO_COLUMN, type NotificationChannelHorizon } from '@/lib/notifications/preferences';
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
  computePostEventWindow,
  filterUnreportedRecipients,
  buildPostEventPayload,
  POST_EVENT_PUSH_WINDOW,
} from '@/lib/notifications/reminder-dispatch';
import { createNotification } from '@/lib/notifications/inbox/repo';
import { resolveMemberIds } from '@/lib/auth/resolve-member-id';
import { BROADCAST_ENABLED, BROADCAST_START_TYPE, computeBroadcastRecipients } from '@/lib/notifications/broadcast';

// Channel type → inbox type. Email uses bare horizon strings (24hr / 1hr /
// 15min); push uses push-prefixed strings (push-1hr / push-15min /
// push-start). Both collapse to the same inbox-type axis.
function reminderInboxType(channelType: string): string {
  switch (channelType) {
    case '24hr':
    case 'push-24hr': return 'reminder.24hr';
    case '1hr':
    case 'push-1hr': return 'reminder.1hr';
    case '15min':
    case 'push-15min': return 'reminder.15min';
    case 'push-start': return 'reminder.start';
    default: return `reminder.${channelType}`;
  }
}

async function safeCreateInboxRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  params: Parameters<typeof createNotification>[1],
): Promise<void> {
  try {
    await createNotification(db, params);
  } catch (err) {
    console.error('[send-reminders] inbox write failed', err);
  }
}

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

    // Find events in window with users opted-in via notification_preferences
    // Visibility filter intentionally NOT applied — this endpoint serves
    // reminder dispatch and must see all events regardless of visibility.
    const prefColumn = notificationPreferences[WINDOW_TO_COLUMN[type as NotificationChannelHorizon]];
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
      .innerJoin(rsvps, and(eq(rsvps.eventId, events.id), not(eq(rsvps.status, 'no'))))
      .innerJoin(notificationPreferences, eq(notificationPreferences.userId, rsvps.userId))
      .where(and(
        gte(events.startsAt, windowStart),
        lte(events.startsAt, windowEnd),
        eq(prefColumn, true),
      ));

    if (dueEvents.length === 0) continue;

    // Check which have already been sent for this reminder type
    const alreadySent = await db
      .select({ eventId: notificationLog.eventId, userId: notificationLog.userId })
      .from(notificationLog)
      .where(eq(notificationLog.type, type));

    const sentSet = new Set(alreadySent.map((s) => `${s.eventId}:${s.userId}`));

    // Gather member emails + timezones. RSVP rows carry either hyloId
    // (existing Hylo users) or clerkId (Clerk-only users) in user_id —
    // look members up by either identity column. The map is keyed by
    // whichever id matched so memberMap.get(due.userId) below works
    // regardless of which provider the user signed in with.
    const userIds = [...new Set(dueEvents.map((e) => e.userId))];
    const memberRows =
      userIds.length > 0
        ? await db
            .select({
              hyloId: members.hyloId,
              clerkId: members.clerkId,
              email: members.email,
              timezone: members.timezone,
            })
            .from(members)
            .where(
              or(
                inArray(members.hyloId, userIds),
                inArray(members.clerkId, userIds),
              ),
            )
        : [];
    const userIdSet = new Set(userIds);
    const memberMap = new Map<string, (typeof memberRows)[number]>();
    for (const m of memberRows) {
      if (m.hyloId && userIdSet.has(m.hyloId)) memberMap.set(m.hyloId, m);
      if (m.clerkId && userIdSet.has(m.clerkId)) memberMap.set(m.clerkId, m);
    }

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
        const memberIdMap = await resolveMemberIds(db, [due.userId]);
        await db
          .insert(notificationLog)
          .values({
            eventId: due.eventId,
            userId: due.userId,
            memberId: memberIdMap.get(due.userId) ?? null,
            type,
          })
          .onConflictDoNothing();
        await safeCreateInboxRow(db, {
          userId: due.userId,
          type: reminderInboxType(type),
          eventId: due.eventId,
          title: subject,
          url: `/events/${due.eventId}`,
          payload: { channel: 'email', horizon: type },
        });
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

    // Visibility filter intentionally NOT applied — this endpoint serves
    // push reminder dispatch and must see all events regardless of visibility.
    const pushPrefColumn = notificationPreferences[WINDOW_TO_COLUMN[w.type as NotificationChannelHorizon]];
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
      .innerJoin(rsvps, and(eq(rsvps.eventId, events.id), not(eq(rsvps.status, 'no'))))
      .innerJoin(notificationPreferences, eq(notificationPreferences.userId, rsvps.userId))
      .where(and(
        gte(events.startsAt, windowStart),
        lte(events.startsAt, windowEnd),
        eq(pushPrefColumn, true),
      ));

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
        const memberIdMap = await resolveMemberIds(db, info.userIds);
        await db
          .insert(notificationLog)
          .values(
            info.userIds.map((uid) => ({
              eventId,
              userId: uid,
              memberId: memberIdMap.get(uid) ?? null,
              type: w.type,
            })),
          )
          .onConflictDoNothing();
        for (const uid of info.userIds) {
          await safeCreateInboxRow(db, {
            userId: uid,
            type: reminderInboxType(w.type),
            eventId,
            title: w.title(info.title),
            body: w.body,
            url,
            payload: { channel: 'push', horizon: w.type },
          });
        }
      }
    }

    // Broadcast at-start push to non-RSVPed members (gated by BROADCAST_ENABLED)
    if (BROADCAST_ENABLED && w.type === 'push-start') {
      const atStartEvents = await db
        .select({
          id: events.id,
          title: events.title,
          startsAt: events.startsAt,
          visibility: events.visibility,
          location: events.location,
          description: events.description,
        })
        .from(events)
        .where(and(
          gte(events.startsAt, windowStart),
          lte(events.startsAt, windowEnd),
        ));

      for (const ev of atStartEvents) {
        const recipients = await computeBroadcastRecipients(db, {
          id: ev.id,
          visibility: ev.visibility,
          startsAt: ev.startsAt,
        });
        if (recipients.length === 0) continue;

        const url = pickPushClickUrl(ev.id, ev.location, ev.description);
        const userIds = recipients.map((r) => r.userId);
        const result = await sendPushToUsers(userIds, {
          title: ev.title,
          body: `${ev.title} is starting now`,
          url,
          tag: `broadcast-start-${ev.id}`,
        });
        pushSent += result.sent;

        if (result.sent > 0) {
          const memberIdMap = await resolveMemberIds(db, userIds);
          await db
            .insert(notificationLog)
            .values(
              userIds.map((uid) => ({
                eventId: ev.id,
                userId: uid,
                memberId: memberIdMap.get(uid) ?? null,
                type: BROADCAST_START_TYPE,
              })),
            )
            .onConflictDoNothing();
          for (const uid of userIds) {
            await safeCreateInboxRow(db, {
              userId: uid,
              type: 'reminder.start',
              eventId: ev.id,
              title: ev.title,
              body: `${ev.title} is starting now`,
              url,
              payload: { channel: 'push', horizon: 'broadcast' },
            });
          }
        }
      }
    }
  }

  // Post-event prompt: ask RSVP=yes attendees to mark whether the event
  // happened. Fires once per (event, user) via notificationLog dedupe and
  // is suppressed for users who already filed an attendanceReports row.
  let postEventSent = 0;
  {
    const { windowStart, windowEnd } = computePostEventWindow(
      now,
      POST_EVENT_PUSH_WINDOW.minMinAfterEnd,
      POST_EVENT_PUSH_WINDOW.maxMinAfterEnd,
    );
    const effectiveEnd = sql<Date>`COALESCE(${events.endsAt}, ${events.startsAt} + interval '60 minutes')`;

    // Visibility filter intentionally NOT applied — this endpoint serves
    // post-event attendance prompt dispatch and must see all events regardless of visibility.
    const due = await db
      .select({
        eventId: events.id,
        title: events.title,
        userId: rsvps.userId,
      })
      .from(events)
      .innerJoin(rsvps, and(eq(rsvps.eventId, events.id), eq(rsvps.status, 'yes')))
      .where(and(gte(effectiveEnd, windowStart), lte(effectiveEnd, windowEnd)));

    if (due.length > 0) {
      const eventIdsForLookup = [...new Set(due.map((d) => d.eventId))];

      const alreadySentPostEvent = await db
        .select({ eventId: notificationLog.eventId, userId: notificationLog.userId })
        .from(notificationLog)
        .where(
          and(
            eq(notificationLog.type, POST_EVENT_PUSH_WINDOW.type),
            inArray(notificationLog.eventId, eventIdsForLookup),
          ),
        );

      const alreadyReported = await db
        .select({ eventId: attendanceReports.eventId, userId: attendanceReports.reporterId })
        .from(attendanceReports)
        .where(inArray(attendanceReports.eventId, eventIdsForLookup));

      const unsent = filterUnsentRecipients(due, alreadySentPostEvent);
      const unreported = filterUnreportedRecipients(unsent, alreadyReported);

      // Group by event so each event gets one push call (multiple userIds).
      const grouped = new Map<number, { title: string; userIds: string[] }>();
      for (const r of unreported) {
        const g = grouped.get(r.eventId);
        if (g) {
          if (!g.userIds.includes(r.userId)) g.userIds.push(r.userId);
        } else {
          grouped.set(r.eventId, { title: r.title, userIds: [r.userId] });
        }
      }

      for (const [eventId, info] of grouped) {
        const payload = buildPostEventPayload(eventId, info.title);
        const result = await sendPushToUsers(info.userIds, payload);
        postEventSent += result.sent;

        if (result.sent > 0) {
          const memberIdMap = await resolveMemberIds(db, info.userIds);
          await db
            .insert(notificationLog)
            .values(
              info.userIds.map((uid) => ({
                eventId,
                userId: uid,
                memberId: memberIdMap.get(uid) ?? null,
                type: POST_EVENT_PUSH_WINDOW.type,
              })),
            )
            .onConflictDoNothing();
          for (const uid of info.userIds) {
            await safeCreateInboxRow(db, {
              userId: uid,
              type: 'post-event.prompt',
              eventId,
              title: payload.title,
              body: payload.body,
              url: payload.url,
              payload: { channel: 'push', horizon: 'post-event' },
            });
          }
        }
      }
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    errors,
    pushSent,
    postEventSent,
    timestamp: now.toISOString(),
  });
}
