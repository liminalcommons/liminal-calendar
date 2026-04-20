# Event Email Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send email reminders (24hr, 1hr, 15min before) to users who RSVP and opt in, using Resend for delivery and a chora-node cron for scheduling.

**Architecture:** Per-event opt-in checkbox on RSVP → `remindMe` boolean on rsvps table → cron every 5min hits `/api/cron/send-reminders` → finds due reminders via time-window queries → sends via Resend → logs to `notification_log` to prevent duplicates.

**Tech Stack:** Resend (email), Drizzle ORM (Postgres), Next.js API routes, chora-node crontab

---

### Task 1: Schema — add `remindMe` to rsvps + `notification_log` table

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add `remindMe` column to rsvps table**

In `src/lib/db/schema.ts`, add `remindMe` to the rsvps table definition:

```typescript
// In the rsvps table definition, after 'status':
remindMe: boolean('remind_me').default(false),
```

The full rsvps table becomes:
```typescript
export const rsvps = pgTable(
  'rsvps',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    userName: text('user_name').notNull(),
    userImage: text('user_image'),
    status: text('status').notNull(),
    remindMe: boolean('remind_me').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('rsvps_event_user_unique').on(table.eventId, table.userId)],
);
```

- [ ] **Step 2: Add `notification_log` table**

In `src/lib/db/schema.ts`, add after the members table:

```typescript
import { boolean } from 'drizzle-orm/pg-core';
// (add 'boolean' to the existing import from 'drizzle-orm/pg-core')

export const notificationLog = pgTable(
  'notification_log',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    type: text('type').notNull(), // '24hr' | '1hr' | '15min'
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique('notification_log_unique').on(table.eventId, table.userId, table.type),
  ],
);

export type NotificationLogEntry = typeof notificationLog.$inferSelect;
```

- [ ] **Step 3: Push schema to database**

Run the same pattern used for `feed_token`:
```javascript
// Node one-liner (from project root):
POSTGRES_URL="<connection string>" node -e "
const { sql } = require('@vercel/postgres');
async function run() {
  await sql\`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS remind_me BOOLEAN DEFAULT false\`;
  await sql\`CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id, type)
  )\`;
  console.log('Done');
}
run().catch(e => { console.error(e); process.exit(1); });
"
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(notifications): add remindMe to rsvps + notification_log table"
```

---

### Task 2: Resend email client

**Files:**
- Create: `src/lib/email.ts`

- [ ] **Step 1: Install resend**

```bash
npm install resend
```

- [ ] **Step 2: Create email wrapper**

Create `src/lib/email.ts`:

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM = process.env.EMAIL_FROM || 'Liminal Calendar <calendar@liminalcommons.com>';

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });
    if (error) {
      console.error('[email] Resend error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email] Send failed:', msg);
    return { success: false, error: msg };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts package.json package-lock.json
git commit -m "feat(notifications): add Resend email client wrapper"
```

---

### Task 3: Reminder email builder

**Files:**
- Create: `src/lib/notifications/reminders.ts`

- [ ] **Step 1: Create the reminder builder**

Create directory and file `src/lib/notifications/reminders.ts`:

```typescript
import { formatInTimeZone } from 'date-fns-tz/formatInTimeZone';
import { createHmac } from 'crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://calendar.castalia.one';
const HMAC_SECRET = process.env.CRON_SECRET || 'dev-secret';

export type ReminderType = '24hr' | '1hr' | '15min';

interface ReminderEvent {
  id: number;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  description: string | null;
  timezone: string;
}

interface ReminderRecipient {
  userId: string;
  email: string;
  timezone: string;
}

function stopReminderToken(eventId: number, userId: string): string {
  return createHmac('sha256', HMAC_SECRET)
    .update(`${eventId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

function stopReminderUrl(eventId: number, userId: string): string {
  const token = stopReminderToken(eventId, userId);
  return `${BASE_URL}/api/notifications/stop-reminder?eventId=${eventId}&userId=${encodeURIComponent(userId)}&token=${token}`;
}

export function verifyStopToken(eventId: number, userId: string, token: string): boolean {
  return stopReminderToken(eventId, userId) === token;
}

function formatEventTime(date: Date, tz: string): string {
  try {
    return formatInTimeZone(date, tz, 'EEEE, MMMM d · h:mm a zzz');
  } catch {
    return date.toISOString();
  }
}

function extractMeetingLink(event: ReminderEvent): string | null {
  const text = `${event.location || ''} ${event.description || ''}`;
  const match = text.match(/https?:\/\/[^\s<"]+/);
  return match ? match[0] : null;
}

export function buildReminderEmail(
  type: ReminderType,
  event: ReminderEvent,
  recipient: ReminderRecipient,
): { subject: string; html: string } {
  const tz = recipient.timezone || event.timezone || 'UTC';
  const timeStr = formatEventTime(event.startsAt, tz);
  const meetingLink = extractMeetingLink(event);
  const eventUrl = `${BASE_URL}/events/${event.id}`;
  const stopUrl = stopReminderUrl(event.id, recipient.userId);

  const subjects: Record<ReminderType, string> = {
    '24hr': `Tomorrow: ${event.title}`,
    '1hr': `${event.title} starts in 1 hour`,
    '15min': `${event.title} starting soon!`,
  };

  const subject = subjects[type];

  // Minimal, mobile-friendly HTML email
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1612;color:#e8dcc8;margin:0;padding:0;">
<div style="max-width:480px;margin:0 auto;padding:24px 16px;">

  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:12px;color:#a08c6e;letter-spacing:2px;text-transform:uppercase;">Liminal Commons</span>
  </div>

  <h1 style="font-size:20px;font-weight:600;color:#e8dcc8;margin:0 0 8px 0;">${escapeHtml(event.title)}</h1>
  <p style="font-size:14px;color:#a08c6e;margin:0 0 20px 0;">${timeStr}</p>

  ${event.location ? `<p style="font-size:14px;color:#c4935a;margin:0 0 8px 0;">📍 ${escapeHtml(event.location)}</p>` : ''}

  ${meetingLink && type !== '24hr' ? `
  <div style="margin:20px 0;">
    <a href="${meetingLink}" style="display:inline-block;padding:12px 24px;background:#c4935a;color:#1a1612;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
      ${type === '15min' ? 'Join Now' : 'Join Meeting'}
    </a>
  </div>` : ''}

  <div style="margin:20px 0;">
    <a href="${eventUrl}" style="font-size:13px;color:#c4935a;text-decoration:underline;">View event details</a>
  </div>

  <hr style="border:none;border-top:1px solid #2a2520;margin:24px 0;">
  <p style="font-size:11px;color:#6b5f4f;text-align:center;">
    <a href="${stopUrl}" style="color:#6b5f4f;text-decoration:underline;">Stop reminders for this event</a>
  </p>

</div></body></html>`;

  return { subject, html };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/lib/notifications
git add src/lib/notifications/reminders.ts
git commit -m "feat(notifications): reminder email builder with timezone formatting"
```

---

### Task 4: Cron endpoint — send reminders

**Files:**
- Create: `src/app/api/cron/send-reminders/route.ts`

- [ ] **Step 1: Create the cron endpoint**

Create `src/app/api/cron/send-reminders/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, rsvps, members, notificationLog } from '@/lib/db/schema';
import { and, eq, gte, lte, not, inArray, sql } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { buildReminderEmail, type ReminderType } from '@/lib/notifications/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Reminder windows: [type, minMinutesBefore, maxMinutesBefore]
const WINDOWS: [ReminderType, number, number][] = [
  ['24hr', 1435, 1445], // 23h55m to 24h05m
  ['1hr', 55, 65],       // 55m to 1h05m
  ['15min', 10, 20],     // 10m to 20m
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

    // Find events starting in this window that have opted-in RSVPs
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
        rsvpStatus: rsvps.status,
      })
      .from(events)
      .innerJoin(rsvps, and(
        eq(rsvps.eventId, events.id),
        eq(rsvps.remindMe, true),
        not(eq(rsvps.status, 'no')),
      ))
      .where(and(
        gte(events.startsAt, windowStart),
        lte(events.startsAt, windowEnd),
      ));

    if (dueEvents.length === 0) continue;

    // Filter out already-sent notifications
    const eventUserPairs = dueEvents.map(e => `${e.eventId}:${e.userId}`);
    const alreadySent = await db
      .select({ eventId: notificationLog.eventId, userId: notificationLog.userId })
      .from(notificationLog)
      .where(and(
        eq(notificationLog.type, type),
        sql`(${notificationLog.eventId}::text || ':' || ${notificationLog.userId}) = ANY(${eventUserPairs})`,
      ));

    const sentSet = new Set(alreadySent.map(s => `${s.eventId}:${s.userId}`));

    // Get member emails + timezones
    const userIds = [...new Set(dueEvents.map(e => e.userId))];
    const memberRows = userIds.length > 0
      ? await db
          .select({ hyloId: members.hyloId, email: members.email, timezone: members.timezone })
          .from(members)
          .where(inArray(members.hyloId, userIds))
      : [];
    const memberMap = new Map(memberRows.map(m => [m.hyloId, m]));

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

      const { subject, html } = buildReminderEmail(type, {
        id: due.eventId,
        title: due.title,
        startsAt: due.startsAt,
        endsAt: due.endsAt,
        location: due.location,
        description: due.description,
        timezone: due.eventTimezone || 'UTC',
      }, {
        userId: due.userId,
        email: member.email,
        timezone: member.timezone || 'UTC',
      });

      const result = await sendEmail(member.email, subject, html);

      if (result.success) {
        await db.insert(notificationLog).values({
          eventId: due.eventId,
          userId: due.userId,
          type,
        }).onConflictDoNothing();
        sent++;
      } else {
        console.error(`[send-reminders] Failed for ${due.userId} event ${due.eventId}: ${result.error}`);
        errors++;
      }
    }
  }

  return NextResponse.json({ sent, skipped, errors, timestamp: now.toISOString() });
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/app/api/cron/send-reminders
git add src/app/api/cron/send-reminders/route.ts
git commit -m "feat(notifications): cron endpoint for sending email reminders"
```

---

### Task 5: Stop-reminder endpoint

**Files:**
- Create: `src/app/api/notifications/stop-reminder/route.ts`

- [ ] **Step 1: Create the stop-reminder endpoint**

Create `src/app/api/notifications/stop-reminder/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rsvps, events } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyStopToken } from '@/lib/notifications/reminders';

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId');
  const userId = request.nextUrl.searchParams.get('userId');
  const token = request.nextUrl.searchParams.get('token');

  if (!eventId || !userId || !token) {
    return new NextResponse('Missing parameters', { status: 400 });
  }

  const numEventId = parseInt(eventId, 10);
  if (isNaN(numEventId)) {
    return new NextResponse('Invalid event ID', { status: 400 });
  }

  if (!verifyStopToken(numEventId, userId, token)) {
    return new NextResponse('Invalid token', { status: 403 });
  }

  // Set remindMe to false
  await db
    .update(rsvps)
    .set({ remindMe: false })
    .where(and(eq(rsvps.eventId, numEventId), eq(rsvps.userId, userId)));

  // Get event title for confirmation
  const [event] = await db
    .select({ title: events.title })
    .from(events)
    .where(eq(events.id, numEventId));

  const title = event?.title || 'this event';

  return new NextResponse(
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1612;color:#e8dcc8;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;">
<div style="text-align:center;max-width:400px;padding:24px;">
  <p style="font-size:18px;margin:0 0 8px 0;">Reminders stopped</p>
  <p style="font-size:14px;color:#a08c6e;">You won't receive any more email reminders for <strong>${title.replace(/</g, '&lt;')}</strong>.</p>
  <a href="https://calendar.castalia.one" style="display:inline-block;margin-top:16px;color:#c4935a;text-decoration:underline;font-size:14px;">Back to calendar</a>
</div>
</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/app/api/notifications/stop-reminder
git add src/app/api/notifications/stop-reminder/route.ts
git commit -m "feat(notifications): stop-reminder endpoint for one-click unsubscribe"
```

---

### Task 6: RSVP API — accept `remindMe` field

**Files:**
- Modify: `src/app/api/events/[id]/rsvp/route.ts`

- [ ] **Step 1: Extend POST handler to accept remindMe**

In `src/app/api/events/[id]/rsvp/route.ts`, after parsing `response` from the body (line 32), also extract `remindMe`:

```typescript
  const { response, remindMe } = body as Record<string, unknown>;
```

In the upsert logic, include `remindMe` in both update and insert. Replace the existing upsert block (lines 58-71) with:

```typescript
    const remindMeValue = typeof remindMe === 'boolean' ? remindMe : undefined;

    if (existing) {
      const updateSet: Record<string, unknown> = { status: response as string, userName, userImage };
      if (remindMeValue !== undefined) updateSet.remindMe = remindMeValue;
      await db
        .update(rsvps)
        .set(updateSet)
        .where(eq(rsvps.id, existing.id));
    } else {
      await db.insert(rsvps).values({
        eventId: numId,
        userId,
        userName,
        userImage,
        status: response as string,
        remindMe: remindMeValue ?? false,
      });
    }
```

- [ ] **Step 2: Extend GET handler to return remindMe**

In the GET handler, update the items mapping (around line 111) to include `remindMe`:

```typescript
    const invitations = {
      total: eventRsvps.length,
      items: eventRsvps.map((r) => ({
        id: String(r.id),
        person: {
          id: r.userId,
          name: r.userName,
          avatarUrl: r.userImage,
        },
        response: r.status,
        remindMe: r.remindMe ?? false,
      })),
    };
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/events/[id]/rsvp/route.ts
git commit -m "feat(notifications): accept remindMe in RSVP API"
```

---

### Task 7: RSVP UI — add reminder checkbox

**Files:**
- Modify: `src/components/events/EventRSVP.tsx`

- [ ] **Step 1: Add remindMe state and handler**

In `EventRSVP`, add state for remindMe after the existing state declarations (around line 81):

```typescript
  const [remindMe, setRemindMe] = useState(false);
```

Update `fetchAttendees` to extract the current user's `remindMe` value (inside the existing function, after setting attendees):

```typescript
  async function fetchAttendees() {
    try {
      const res = await apiFetch(`/api/events/${eventId}/rsvp`);
      if (res.ok) {
        const data = await res.json();
        const items: AttendeeItem[] = data.invitations?.items ?? [];
        setAttendees(items);
        // Sync remindMe from current user's RSVP
        const user = session?.user as any;
        const myUserId = user?.hyloId ?? user?.id;
        if (myUserId) {
          const myRsvp = items.find(a => a.person.id === myUserId);
          if (myRsvp) setRemindMe((myRsvp as any).remindMe ?? false);
        }
      }
    } catch (e) {
      console.error('Failed to fetch attendees:', e);
    }
  }
```

Update `handleRSVP` to pass `remindMe` in the POST body:

```typescript
  async function handleRSVP(response: 'yes' | 'interested' | 'no') {
    if (!token) return;
    const prev = currentResponse;
    setCurrentResponse(response === 'no' ? null : response);
    setUpdating(true);

    try {
      const res = await apiFetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, remindMe: response === 'no' ? false : remindMe }),
      });
      if (res.ok) {
        calendarSFX.play('shimmer');
        await fetchAttendees();
      } else {
        setCurrentResponse(prev);
      }
    } catch (e) {
      console.error('Failed to RSVP:', e);
      setCurrentResponse(prev);
    } finally {
      setUpdating(false);
    }
  }
```

Add a toggle handler for the checkbox:

```typescript
  async function handleToggleRemind() {
    const next = !remindMe;
    setRemindMe(next);
    // Persist immediately if already RSVP'd
    if (currentResponse && currentResponse !== 'no') {
      await apiFetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: currentResponse, remindMe: next }),
      });
    }
  }
```

- [ ] **Step 2: Add checkbox UI after RSVP buttons**

In the JSX, after the RSVP buttons div (after line 226), add the reminder checkbox. It only shows when the user has an active RSVP:

```tsx
      {/* Reminder opt-in — shown when RSVP'd */}
      {isSignedIn && currentResponse && currentResponse !== 'no' && (
        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={remindMe}
            onChange={handleToggleRemind}
            className="w-4 h-4 rounded border-grove-border text-grove-accent focus:ring-grove-accent"
          />
          <span className="text-xs text-grove-text-muted">
            Email me reminders (24hr, 1hr, 15min before)
          </span>
        </label>
      )}
```

- [ ] **Step 3: Update AttendeeItem interface to include remindMe**

Update the `AttendeeItem` interface at the top of the file:

```typescript
interface AttendeeItem {
  id?: string;
  person: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  response: string;
  remindMe?: boolean;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/events/EventRSVP.tsx
git commit -m "feat(notifications): add reminder opt-in checkbox to RSVP UI"
```

---

### Task 8: Add middleware exclusion for notification routes

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Exclude notification API routes from redirect middleware**

The stop-reminder endpoint must work without auth (clicked from email). The current middleware at `src/middleware.ts` has a matcher that already excludes `api/` routes for auth-related paths. Update the matcher to also exclude notification routes:

In `src/middleware.ts`, the matcher already covers this since `api/notifications` and `api/cron` are not in the redirect check (middleware only redirects `liminalcalendar.com` hosts). No change needed unless the matcher blocks these paths.

Verify the current matcher allows `/api/cron/send-reminders` and `/api/notifications/stop-reminder` through. The current matcher is:
```
'/((?!_next/static|_next/image|favicon\\.ico).*)'
```

This matches everything except static assets, which means our new API routes are already covered. No changes needed.

- [ ] **Step 2: Commit (skip if no changes)**

No commit needed — middleware already allows the new routes.

---

### Task 9: Environment variables + cron setup

**Files:**
- Modify: `vercel.json` (no change — cron on chora-node)

- [ ] **Step 1: Add Resend env vars to Vercel**

```bash
# Add to Vercel production environment
printf 're_YOUR_RESEND_API_KEY' | npx vercel env add RESEND_API_KEY production
printf 'Liminal Calendar <calendar@liminalcommons.com>' | npx vercel env add EMAIL_FROM production
```

Replace `re_YOUR_RESEND_API_KEY` with the actual key from https://resend.com/api-keys.

- [ ] **Step 2: Set up cron on chora-node**

SSH into chora-node and add:

```bash
ssh chora-node
crontab -e
# Add this line:
*/5 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://calendar.castalia.one/api/cron/send-reminders >> /tmp/calendar-reminders.log 2>&1
```

- [ ] **Step 3: Deploy to Vercel**

```bash
cd packages/liminal-calendar
git push
npx vercel --prod
```

- [ ] **Step 4: Test the cron endpoint**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://calendar.castalia.one/api/cron/send-reminders
```

Expected: `{"sent":0,"skipped":0,"errors":0,"timestamp":"..."}`

- [ ] **Step 5: Commit vercel.json if changed**

No vercel.json change needed — cron runs on chora-node, not Vercel.

---

### Task 10: End-to-end verification

- [ ] **Step 1: Sign in to calendar.castalia.one**
- [ ] **Step 2: Navigate to an upcoming event**
- [ ] **Step 3: Click "Going" and check the "Email me reminders" checkbox**
- [ ] **Step 4: Verify RSVP API response includes `remindMe: true`**
- [ ] **Step 5: Trigger cron manually (if event is within a reminder window)**
- [ ] **Step 6: Check Resend dashboard for sent email**
- [ ] **Step 7: Click "Stop reminders" link in email — verify remindMe becomes false**
- [ ] **Step 8: Trigger cron again — verify no duplicate send (skipped count)**
