# Notification Robustness + Global Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move notification opt-in from per-RSVP to per-user global preferences with channel × horizon granularity, fix the iOS install path so iPhone Safari users can actually enable notifications, wire heartbeat monitoring, and clean up the event detail view — all per the spec at `docs/superpowers/specs/2026-05-02-notification-robustness-design.md`.

**Architecture:** New `notification_preferences` table replaces `rsvps.remindMe` as the cron read-path filter; one `<NotificationPreferences>` component renders in both `SubscribePrompt` onboarding and a new `/settings/notifications` page; `InstallPrompt` gains an iOS-Safari branch; `/api/cron/heartbeat-check` daily Vercel cron emails admin on staleness as backup to UptimeRobot.

**Tech Stack:** Next.js App Router, Drizzle ORM (Postgres), NextAuth v5 (`@/../auth`), web-push (VAPID), Jest + React Testing Library for unit/component tests, Chrome MCP for E2E acceptance.

---

## Spec reference

This plan implements the spec sections as follows. Use this map to verify coverage.

| Spec § | Plan task(s) |
|---|---|
| §5.1 New table | Task 1 |
| §5.2 `rsvps.remindMe` fate | Task 14 (cleanup) |
| §5.3 `WINDOW_TO_COLUMN` map | Task 2 |
| §6 Cron read-path swap | Task 4 |
| §7.1 `<NotificationPreferences>` | Task 5 |
| §7.2 SubscribePrompt iOS guard + integration | Tasks 9, 10 |
| §7.3 Settings route | Tasks 6, 7 |
| §7.4 InstallPrompt iOS branch | Task 8 |
| §7.5 EventRSVP cleanups | Tasks 14, 15 |
| §8 ICS feed `?filter=rsvps-only` | Task 11 |
| §9 Heartbeat-check cron + ops doc | Tasks 12, 13 |
| §10 Delete NotificationScheduler | Task 14 |
| §11.1 Jest test matrix | Threaded through every task |
| §11.2 Chrome MCP E2E | Task 16 (final gate) |

---

## File structure

### New files (10)

| Path | Responsibility |
|---|---|
| `src/lib/notifications/preferences.ts` | `WINDOW_TO_COLUMN` map + `getPreferences` / `ensurePreferences` / `updatePreferences` helpers |
| `src/lib/db/migrations/NNNN_notification_preferences.sql` | Drizzle migration (auto-numbered by `drizzle-kit generate`) |
| `src/components/NotificationPreferences.tsx` | Shared 6-checkbox grid component |
| `src/app/settings/notifications/page.tsx` | Settings route shell |
| `src/app/settings/notifications/RsvpedEventsList.tsx` | "Events you'll be notified about" preview list |
| `src/app/api/preferences/notifications/route.ts` | GET/PUT JSON API |
| `src/app/api/preferences/notifications/rsvped-events/route.ts` | GET JSON list of user's upcoming RSVPed events (used by `RsvpedEventsList`) |
| `src/app/api/cron/heartbeat-check/route.ts` | Vercel daily cron, emails admin on stale |
| `src/__tests__/lib/notifications/preferences.test.ts` | Unit tests for the lib helpers |
| `src/__tests__/components/NotificationPreferences.test.tsx` | Component tests |
| `src/__tests__/app/api/cron/send-reminders-prefs.test.ts` | Cron read-path test |

### Modified files (10)

| Path | Change |
|---|---|
| `src/lib/db/schema.ts` | Add `notificationPreferences` table; add comment on vestigial `rsvps.remindMe` |
| `src/app/api/cron/send-reminders/route.ts` | Swap join filter from `rsvps.remindMe` to `notification_preferences.{column}` |
| `src/lib/notifications/reminder-dispatch.ts` | If used by the cron route, thread the per-window column through |
| `src/components/InstallPrompt.tsx` | Add iOS-Safari branch (~30 LOC) |
| `src/components/SubscribePrompt.tsx` | Replace handcrafted notif step with `<NotificationPreferences>`; add iOS guard |
| `src/components/NavGearMenu.tsx` | Add "Notifications" menu item linking to `/settings/notifications` |
| `src/components/events/EventRSVP.tsx` | Remove `remindMe` toggle + newsletter signup; add inline "Recurring — applies to all occurrences" text |
| `src/app/api/calendar/feed.ics/route.ts` | Add `?filter=rsvps-only` handling |
| `src/app/layout.tsx` | Remove `<NotificationScheduler />` mount and import |
| `vercel.json` | Add `/api/cron/heartbeat-check` daily entry |
| `docs/notifications/scheduling.md` | Add §Operator Playbook with UptimeRobot setup + backup cron note |

### Deletions (1)

- `src/components/NotificationScheduler.tsx` — entire file

---

## TDD discipline (read once)

Every task follows the IRON LAW from `CLAUDE.md`: **failing test first, run it, see RED, write minimal code, run it, see GREEN, commit.** No production code without a failing test. The opponent-loop's positiva cycle owns the GREEN; the negativa cycle owns regression detection and review.

For each task:
1. Read the existing files mentioned in **Files**
2. Write the test (it should fail because the code doesn't exist yet, or because behavior differs)
3. Run the specific test, confirm RED for the right reason
4. Write minimal code to GREEN
5. Run the test again, confirm GREEN
6. Run `npx tsc --noEmit` in the package, confirm no type errors
7. Commit with the suggested message

Project test command: `cd packages/liminal-calendar && npx jest <path>` for a single test, `npx jest` for full suite.

---

## Task 1: Add `notification_preferences` table to schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (append after `pushSubscriptions` table, around line 95)
- Create: `src/lib/db/migrations/NNNN_notification_preferences.sql` (auto-generated)

- [x] **Step 1: Append the table definition to schema.ts**

```ts
// Per-user notification preferences. Replaces per-RSVP `rsvps.remindMe`
// as the cron read-path gate. One row per user, lazily inserted with
// defaults the first time the user (or cron) reads their preferences.
// Defaults: push columns TRUE, email columns FALSE — push is primary,
// email is opt-in.
export const notificationPreferences = pgTable('notification_preferences', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().unique(), // Hylo user id OR Clerk user id (matches rsvps.user_id pattern)
  pushOneHour: boolean('push_1h').notNull().default(true),
  pushFifteenMin: boolean('push_15min').notNull().default(true),
  pushAtStart: boolean('push_at_start').notNull().default(true),
  emailTwentyFourHour: boolean('email_24h').notNull().default(false),
  emailOneHour: boolean('email_1h').notNull().default(false),
  emailFifteenMin: boolean('email_15min').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferences = typeof notificationPreferences.$inferInsert;
```

Also: add a one-line comment above the existing `remindMe` field on the `rsvps` table:

```ts
// Vestigial as of the global-preferences slice (2026-05-02).
// Cron read-path no longer reads this column; defaulted TRUE on writes.
// Re-activated as a per-instance override hook when follow-up B ships.
remindMe: boolean('remind_me').default(false),
```

- [x] **Step 2: Generate the migration** (DEVIATION: project uses hand-written SQL migrations per `push-subscriptions.sql` precedent, not drizzle-kit auto-gen. Wrote `src/lib/db/migrations/notification-preferences.sql` directly.)

- [x] **Step 3: Verify generated SQL**

Open the generated file. It must contain:
```sql
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "push_1h" boolean DEFAULT true NOT NULL,
  "push_15min" boolean DEFAULT true NOT NULL,
  "push_at_start" boolean DEFAULT true NOT NULL,
  "email_24h" boolean DEFAULT false NOT NULL,
  "email_1h" boolean DEFAULT false NOT NULL,
  "email_15min" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
```

- [x] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [x] **Step 5: Commit** — committed at 025caa3.

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(db): add notification_preferences table"
```

---

## Task 2: `WINDOW_TO_COLUMN` map + preferences lib helpers

**Files:**
- Create: `src/lib/notifications/preferences.ts`
- Test: `src/__tests__/lib/notifications/preferences.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/notifications/preferences.test.ts
import { WINDOW_TO_COLUMN, type NotificationChannelHorizon } from '@/lib/notifications/preferences';

describe('WINDOW_TO_COLUMN', () => {
  it('maps every cron window string to a notification_preferences column', () => {
    expect(WINDOW_TO_COLUMN['push-1hr']).toBe('pushOneHour');
    expect(WINDOW_TO_COLUMN['push-15min']).toBe('pushFifteenMin');
    expect(WINDOW_TO_COLUMN['push-start']).toBe('pushAtStart');
    expect(WINDOW_TO_COLUMN['24hr']).toBe('emailTwentyFourHour');
    expect(WINDOW_TO_COLUMN['1hr']).toBe('emailOneHour');
    expect(WINDOW_TO_COLUMN['15min']).toBe('emailFifteenMin');
  });

  it('has exactly six entries (no drift)', () => {
    expect(Object.keys(WINDOW_TO_COLUMN)).toHaveLength(6);
  });
});

describe('ensurePreferences (fake db)', () => {
  function makeFakeDb() {
    const inserts: unknown[] = [];
    const selects: unknown[] = [];
    let selectResult: unknown[] = [];
    const db = {
      insert: () => ({
        values: (v: unknown) => ({
          onConflictDoNothing: () => {
            inserts.push(v);
            return Promise.resolve();
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: (w: unknown) => {
            selects.push(w);
            return Promise.resolve(selectResult);
          },
        }),
      }),
      __setSelectResult(rows: unknown[]) { selectResult = rows; },
    };
    return { db, inserts, selects };
  }

  it('inserts with onConflictDoNothing then returns the existing row', async () => {
    const { ensurePreferences } = await import('@/lib/notifications/preferences');
    const { db, inserts } = makeFakeDb();
    (db as any).__setSelectResult([{ userId: 'u1', pushOneHour: true }]);
    const result = await ensurePreferences(db as any, 'u1');
    expect(inserts).toEqual([{ userId: 'u1' }]); // defaults come from the column DEFAULTs
    expect(result?.userId).toBe('u1');
  });
});
```

- [x] **Step 2: Run the test, see RED** — confirmed: `Could not locate module @/lib/notifications/preferences` (test suite failed to run for the right reason).

Run: `npx jest src/__tests__/lib/notifications/preferences.test.ts`
Expected: FAIL — `Cannot find module '@/lib/notifications/preferences'`.

- [x] **Step 3: Write the minimal implementation**

```ts
// src/lib/notifications/preferences.ts
import { eq } from 'drizzle-orm';
import { notificationPreferences, type NotificationPreferences } from '@/lib/db/schema';

export const WINDOW_TO_COLUMN = {
  'push-1hr': 'pushOneHour',
  'push-15min': 'pushFifteenMin',
  'push-start': 'pushAtStart',
  '24hr': 'emailTwentyFourHour',
  '1hr': 'emailOneHour',
  '15min': 'emailFifteenMin',
} as const;

export type NotificationChannelHorizon = keyof typeof WINDOW_TO_COLUMN;
export type NotificationPreferenceColumn = (typeof WINDOW_TO_COLUMN)[NotificationChannelHorizon];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePreferences(db: any, userId: string): Promise<NotificationPreferences | null> {
  await db.insert(notificationPreferences).values({ userId }).onConflictDoNothing();
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  return rows[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPreferences(db: any, userId: string): Promise<NotificationPreferences | null> {
  return ensurePreferences(db, userId);
}

export interface PreferencesUpdate {
  pushOneHour?: boolean;
  pushFifteenMin?: boolean;
  pushAtStart?: boolean;
  emailTwentyFourHour?: boolean;
  emailOneHour?: boolean;
  emailFifteenMin?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updatePreferences(db: any, userId: string, update: PreferencesUpdate): Promise<void> {
  await ensurePreferences(db, userId);
  await db
    .update(notificationPreferences)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(notificationPreferences.userId, userId));
}
```

- [x] **Step 4: Run the test, see GREEN** — confirmed: 3 tests pass (`Test Suites: 1 passed`, `Tests: 3 passed`).

Run: `npx jest src/__tests__/lib/notifications/preferences.test.ts`
Expected: PASS (8 assertions across 3 test blocks).

- [x] **Step 5: Run typecheck** — confirmed: `npx tsc --noEmit` exit=0 (silent). Already implicit in Step 4's jest run, but verified explicitly per cycle protocol.

Run: `npx tsc --noEmit`
Expected: PASS.

- [x] **Step 6: Commit** — files already committed across the RED commit (9da2ade) + GREEN commit (f57c380). No new commit needed; positiva's per-RED/GREEN cadence already produced the durable artifacts. Tick reflects that Task 2 is structurally complete.

```bash
git add src/lib/notifications/preferences.ts src/__tests__/lib/notifications/preferences.test.ts
git commit -m "feat(notifications): preferences lib + WINDOW_TO_COLUMN map"
```

---

## Task 3: `/api/preferences/notifications` GET + PUT route

**Files:**
- Create: `src/app/api/preferences/notifications/route.ts`
- Test: `src/__tests__/app/api/preferences-notifications.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// src/__tests__/app/api/preferences-notifications.test.ts
import { GET, PUT } from '@/app/api/preferences/notifications/route';

jest.mock('@/../auth', () => ({
  auth: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn(() => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) })),
    select: jest.fn(() => ({
      from: () => ({
        where: () => Promise.resolve([{
          userId: 'u1',
          pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
          emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
        }]),
      }),
    })),
    update: jest.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
  },
}));

const { auth } = jest.requireMock('@/../auth') as { auth: jest.Mock };

describe('GET /api/preferences/notifications', () => {
  it('returns 401 without a session', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('returns the lazy-inserted preferences row for the authed user', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', hyloId: 'u1' } });
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pushOneHour).toBe(true);
    expect(body.emailFifteenMin).toBe(false);
  });
});

describe('PUT /api/preferences/notifications', () => {
  it('returns 401 without a session', async () => {
    auth.mockResolvedValue(null);
    const res = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
  });

  it('rejects non-boolean values with 400', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', hyloId: 'u1' } });
    const res = await PUT(new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ pushOneHour: 'yes' }),
    }));
    expect(res.status).toBe(400);
  });

  it('persists boolean updates and returns ok', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', hyloId: 'u1' } });
    const res = await PUT(new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ pushOneHour: false, emailOneHour: true }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
```

- [x] **Step 2: Run the test, see RED** — confirmed: `Could not locate module @/app/api/preferences/notifications/route` (test suite failed to run for the right reason).

Run: `npx jest src/__tests__/app/api/preferences-notifications.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/preferences/notifications/route'`.

- [x] **Step 3: Write the minimal implementation** (TWO DEVIATIONS: (1) added `@jest-environment node` directive to the route test file because Next's `next/server` needs Request global, which jsdom doesn't provide cleanly — matches the existing project convention in `rsvp-route.test.ts`; (2) GET signature changed from `GET()` to `GET(_request: Request)` to satisfy TS strict — the plan's test code calls `GET(new Request(...))` but the plan's impl declared no parameters, causing TS2554. Adding an unused `_request` parameter is the minimal harmonization.)

```ts
// src/app/api/preferences/notifications/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/../auth';
import { db } from '@/lib/db';
import { ensurePreferences, updatePreferences, type PreferencesUpdate } from '@/lib/notifications/preferences';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userIdFromSession(session: any): string {
  return session.user.hyloId || session.user.id;
}

const ALLOWED_KEYS = [
  'pushOneHour', 'pushFifteenMin', 'pushAtStart',
  'emailTwentyFourHour', 'emailOneHour', 'emailFifteenMin',
] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const prefs = await ensurePreferences(db, userIdFromSession(session));
  return NextResponse.json(prefs);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const update: PreferencesUpdate = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      const value = body[key];
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: `${key} must be boolean` }, { status: 400 });
      }
      (update as Record<string, boolean>)[key] = value;
    }
  }
  await updatePreferences(db, userIdFromSession(session), update);
  return NextResponse.json({ ok: true });
}
```

- [x] **Step 4: Run the test, see GREEN** — confirmed: 5/5 tests pass. Full jest suite re-run per negativa-2 improvement: 41/41 suites pass, 345/345 tests pass — no cross-cutting regression. tsc exit=0.

Run: `npx jest src/__tests__/app/api/preferences-notifications.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Run typecheck + commit** — completed in cycle 6 alongside Step 4. tsc exit=0 verified after the GET signature harmonization; files already in commit ba6567c. Tick reflects that Task 3 is structurally complete.

```bash
npx tsc --noEmit
git add src/app/api/preferences/notifications/route.ts src/__tests__/app/api/preferences-notifications.test.ts
git commit -m "feat(api): GET/PUT /api/preferences/notifications"
```

---

## Task 4: Cron read-path swap (replace `rsvps.remindMe` with per-window column)

**Files:**
- Modify: `src/app/api/cron/send-reminders/route.ts`
- Modify: `src/lib/notifications/reminder-dispatch.ts` (if it reads `remindMe`)
- Test: `src/__tests__/app/api/cron/send-reminders-prefs.test.ts`

- [x] **Step 1: Write the failing test** (DEVIATION: added `@jest-environment node` directive at top — same precedent as `rsvp-route.test.ts` and Task 3 cycle 6.)

```ts
// src/__tests__/app/api/cron/send-reminders-prefs.test.ts
// Verifies the cron joins on notification_preferences and uses the
// per-window column. Uses an in-memory fake db that records the join
// arguments so we can assert the new shape without touching Postgres.
import { GET } from '@/app/api/cron/send-reminders/route';

const sendEmailMock = jest.fn().mockResolvedValue({ success: true });
const sendPushMock = jest.fn().mockResolvedValue({ sent: 1, failed: 0 });

jest.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));
jest.mock('@/lib/notifications/push', () => ({
  sendPushToUsers: (...a: unknown[]) => sendPushMock(...a),
}));

// Fake db whose select().from().innerJoin().innerJoin().where() returns canned rows.
const dbCalls: { method: string; args: unknown[] }[] = [];
jest.mock('@/lib/db', () => {
  const mkSelect = (rows: unknown[]) => ({
    from: () => ({
      innerJoin: (...args: unknown[]) => {
        dbCalls.push({ method: 'innerJoin', args });
        return {
          innerJoin: (...args2: unknown[]) => {
            dbCalls.push({ method: 'innerJoin', args: args2 });
            return {
              where: () => Promise.resolve(rows),
            };
          },
          where: () => Promise.resolve(rows),
        };
      },
    }),
  });
  return {
    db: {
      select: () => mkSelect([]),     // no due events for any window in this test
      delete: () => ({ where: () => Promise.resolve() }),
      insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
    },
  };
});

beforeEach(() => {
  dbCalls.length = 0;
  process.env.CRON_SECRET = 'shh';
});

describe('cron send-reminders read path', () => {
  it('rejects without auth', async () => {
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('joins notification_preferences for each window query', async () => {
    const res = await GET(new Request('http://localhost', {
      headers: { authorization: 'Bearer shh' },
    }));
    expect(res.status).toBe(200);

    // 6 windows × 2 inner joins (rsvps + notification_preferences) = 12 innerJoin calls
    expect(dbCalls.filter(c => c.method === 'innerJoin').length).toBeGreaterThanOrEqual(12);
  });
});
```

- [x] **Step 2: Run the test, see RED** — confirmed: `Expected: >= 12, Received: 6`. Current cron does 1 innerJoin per window (3 EMAIL + 3 PUSH = 6 total). Auth-rejection test passes independently. RED for the right reason.

Run: `npx jest src/__tests__/app/api/cron/send-reminders-prefs.test.ts`
Expected: FAIL — current cron only calls `innerJoin(rsvps, ...)` (one join per window), not the second `innerJoin(notificationPreferences, ...)`. So the count will be 6, not ≥12.

- [x] **Step 3: Modify the route to add the second join**

In `src/app/api/cron/send-reminders/route.ts`:

3a. Add imports at the top:
```ts
import { notificationPreferences } from '@/lib/db/schema';
import { WINDOW_TO_COLUMN, type NotificationChannelHorizon } from '@/lib/notifications/preferences';
```

3b. In the email loop (around line 33-54), replace the `.innerJoin(rsvps, ...)` block with:
```ts
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
```

3c. In the push loop (around line 150-167), apply the same swap with `w.type` instead of `type`:
```ts
const pushPrefColumn = notificationPreferences[WINDOW_TO_COLUMN[w.type as NotificationChannelHorizon]];
const due = await db
  .select({ /* same shape */ })
  .from(events)
  .innerJoin(rsvps, and(eq(rsvps.eventId, events.id), not(eq(rsvps.status, 'no'))))
  .innerJoin(notificationPreferences, eq(notificationPreferences.userId, rsvps.userId))
  .where(and(
    gte(events.startsAt, windowStart),
    lte(events.startsAt, windowEnd),
    eq(pushPrefColumn, true),
  ));
```

- [x] **Step 4: Run the test, see GREEN** — confirmed: 2/2 pass for send-reminders-prefs.test.ts.

Run: `npx jest src/__tests__/app/api/cron/send-reminders-prefs.test.ts`
Expected: PASS.

- [x] **Step 5: Verify existing send-reminders tests still pass** — initially 6/9 failed because the existing mock in `send-reminders-route.test.ts` only supported `from().innerJoin().where()` (one innerJoin) but the new query shape needs `from().innerJoin().innerJoin().where()`. Extended the mock with a nested `innerJoin: () => ({ where, innerJoin: () => ({ where }) })` to support both shapes (backwards compatible). All 9/9 send-reminders tests now pass. Full suite: 42/42 suites, 347/347 tests pass.

Run: `npx jest src/__tests__/app/api/ -t "send-reminders"`
Expected: PASS (or update mocks if older tests assumed `remindMe = true` filter).

- [x] **Step 6: Run typecheck + commit** — completed in cycle 9 alongside Steps 3-5. tsc exit=0 verified; impl + mock-fix files committed at 76ad9b8. Tick reflects Task 4 is structurally complete (6/6 boxes).

```bash
npx tsc --noEmit
git add src/app/api/cron/send-reminders/route.ts src/__tests__/app/api/cron/send-reminders-prefs.test.ts
git commit -m "feat(cron): swap remindMe gate for per-window prefs join"
```

---

## Task 4.5: Backfill notification_preferences for existing users

**Inserted in response to negativa-4's HIGH-PRIORITY WARN.** Task 4 swapped the cron read path to an INNER JOIN on `notification_preferences`. Existing production users with RSVPs but no prefs row would be silently excluded until they actively visit settings. User selected option A (backfill migration, mirrors spec §5.1 defaults exactly).

**Files:**
- Create: `src/lib/db/migrations/notification-preferences-backfill.sql`

- [x] **Step 1: Write the backfill SQL** — pure data migration, no jest test (matches `push-subscriptions.sql` precedent for SQL-only migrations). Idempotent: `ON CONFLICT (user_id) DO NOTHING`.

```sql
INSERT INTO notification_preferences (user_id)
SELECT DISTINCT user_id FROM rsvps
ON CONFLICT (user_id) DO NOTHING;
```

- [x] **Step 2: Document operator runbook** — file header explains WHY (silent-regression mitigation), HOW (idempotent INSERT … SELECT DISTINCT), and WHEN (once at deploy of this slice). Future runs are no-ops.

- [x] **Step 3: Commit** — committed alongside this plan update.

---

## Task 5: `<NotificationPreferences>` shared component

**Files:**
- Create: `src/components/NotificationPreferences.tsx`
- Test: `src/__tests__/components/NotificationPreferences.test.tsx`

- [x] **Step 1: Write the failing test** (DEVIATION: replaced `@testing-library/user-event` (not a project dep — only `@testing-library/jest-dom` + `@testing-library/react` are installed) with `fireEvent` from `@testing-library/react`. Functionally equivalent for click events; avoids adding a new dependency.)

```tsx
// src/__tests__/components/NotificationPreferences.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationPreferences } from '@/components/NotificationPreferences';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
});

function mockGetReturns(prefs: Record<string, boolean>) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => prefs,
  } as Response);
}

describe('<NotificationPreferences>', () => {
  it('renders six checkboxes after load', async () => {
    mockGetReturns({
      pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
    });
    render(<NotificationPreferences />);
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    });
  });

  it('reflects loaded state in checkbox checked attribute', async () => {
    mockGetReturns({
      pushOneHour: true, pushFifteenMin: false, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: true, emailFifteenMin: false,
    });
    render(<NotificationPreferences />);
    await waitFor(() => {
      expect(screen.getByLabelText(/1 hour before/i, { selector: 'input[name="pushOneHour"]' })).toBeChecked();
      expect(screen.getByLabelText(/15 minutes before/i, { selector: 'input[name="pushFifteenMin"]' })).not.toBeChecked();
    });
  });

  it('PUTs to /api/preferences/notifications when a checkbox toggles', async () => {
    mockGetReturns({
      pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response);
    render(<NotificationPreferences />);
    await waitFor(() => screen.getAllByRole('checkbox'));
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/24 hours before/i));
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe('/api/preferences/notifications');
      expect(lastCall?.[1]?.method).toBe('PUT');
      const sent = JSON.parse(String(lastCall?.[1]?.body));
      expect(sent.emailTwentyFourHour).toBe(true);
    });
  });
});
```

- [x] **Step 2: Run the test, see RED** — confirmed: `Could not locate module @/components/NotificationPreferences` (module doesn't exist yet).

Run: `npx jest src/__tests__/components/NotificationPreferences.test.tsx`
Expected: FAIL — `Cannot find module '@/components/NotificationPreferences'`.

- [x] **Step 3: Write the minimal implementation**

```tsx
// src/components/NotificationPreferences.tsx
'use client';

import { useEffect, useState } from 'react';

type Prefs = {
  pushOneHour: boolean;
  pushFifteenMin: boolean;
  pushAtStart: boolean;
  emailTwentyFourHour: boolean;
  emailOneHour: boolean;
  emailFifteenMin: boolean;
};

const PUSH_ROWS: Array<{ name: keyof Prefs; label: string }> = [
  { name: 'pushOneHour', label: '1 hour before' },
  { name: 'pushFifteenMin', label: '15 minutes before' },
  { name: 'pushAtStart', label: 'When the event starts' },
];

const EMAIL_ROWS: Array<{ name: keyof Prefs; label: string }> = [
  { name: 'emailTwentyFourHour', label: '24 hours before' },
  { name: 'emailOneHour', label: '1 hour before' },
  { name: 'emailFifteenMin', label: '15 minutes before' },
];

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/preferences/notifications')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setPrefs)
      .catch((e) => setError(e.message));
  }, []);

  async function toggle(name: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [name]: !prefs[name] };
    setPrefs(next);
    try {
      await fetch('/api/preferences/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [name]: next[name] }),
      });
    } catch (e) {
      setPrefs(prefs); // rollback
      setError(e instanceof Error ? e.message : 'save failed');
    }
  }

  if (error) return <div className="text-red-500 text-sm">{error}</div>;
  if (!prefs) return <div className="text-grove-text-muted text-sm">Loading…</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-grove-text mb-2">Push notifications</legend>
        {PUSH_ROWS.map((row) => (
          <label key={row.name} className="flex items-center gap-2 text-sm text-grove-text cursor-pointer">
            <input
              type="checkbox"
              name={row.name}
              checked={prefs[row.name]}
              onChange={() => toggle(row.name)}
            />
            {row.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-grove-text mb-2">Email notifications</legend>
        {EMAIL_ROWS.map((row) => (
          <label key={row.name} className="flex items-center gap-2 text-sm text-grove-text cursor-pointer">
            <input
              type="checkbox"
              name={row.name}
              checked={prefs[row.name]}
              onChange={() => toggle(row.name)}
            />
            {row.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
```

- [x] **Step 4: Run the test, see GREEN** — confirmed: 3/3 pass for NotificationPreferences.test.tsx. Full suite: 43/43 suites, 350/350 tests pass. Typecheck exit=0. Chrome MCP verification deferred to Task 6 per negativa-5 (component has no route to navigate to until /settings/notifications page exists).

Run: `npx jest src/__tests__/components/NotificationPreferences.test.tsx`
Expected: PASS.

- [x] **Step 5: Run typecheck + commit** — completed in cycle 12 alongside Steps 3-4. tsc exit=0 verified; component + test committed at 36793cd. Tick reflects Task 5 is structurally complete (5/5 boxes).

```bash
npx tsc --noEmit
git add src/components/NotificationPreferences.tsx src/__tests__/components/NotificationPreferences.test.tsx
git commit -m "feat(ui): NotificationPreferences shared component"
```

---

## Task 6: `/settings/notifications` route + RsvpedEventsList

**Files:**
- Create: `src/app/settings/notifications/page.tsx`
- Create: `src/app/settings/notifications/RsvpedEventsList.tsx`
- Test: `src/__tests__/app/settings/notifications-page.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
// src/__tests__/app/settings/notifications-page.test.tsx
import { render, screen } from '@testing-library/react';
import Page from '@/app/settings/notifications/page';

jest.mock('@/components/NotificationPreferences', () => ({
  NotificationPreferences: () => <div data-testid="prefs" />,
}));
jest.mock('@/app/settings/notifications/RsvpedEventsList', () => ({
  RsvpedEventsList: () => <div data-testid="rsvps" />,
}));

describe('Settings → Notifications page', () => {
  it('renders the heading, prefs, and rsvped events list', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByTestId('prefs')).toBeInTheDocument();
    expect(screen.getByTestId('rsvps')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the test, see RED** — confirmed: jest fails at the RsvpedEventsList mock target import (`@/app/settings/notifications/RsvpedEventsList` not found) — module doesn't exist yet. RED for the right reason.

Run: `npx jest src/__tests__/app/settings/notifications-page.test.tsx`
Expected: FAIL — module not found.

- [x] **Step 3: Write the minimal implementation** (DEVIATION: added `_request: Request` unused-param + `// @typescript-eslint/no-unused-vars` eslint-disable to the rsvped-events route — same pattern as Task 3 GET signature harmonization. The plan's prescribed code took `request` then used it; I made it `_request` to match Task 3 precedent, but actually use it via `_request.url`. Functionally identical to the plan, just leading-underscore convention.)

```tsx
// src/app/settings/notifications/page.tsx
import { NotificationPreferences } from '@/components/NotificationPreferences';
import { RsvpedEventsList } from '@/app/settings/notifications/RsvpedEventsList';

export default function Page() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold text-grove-text">Notifications</h1>
      <p className="text-sm text-grove-text-muted">
        Choose how you want to be reminded about events you&apos;re attending.
      </p>
      <NotificationPreferences />
      <hr className="border-grove-border/30" />
      <RsvpedEventsList />
    </div>
  );
}
```

```tsx
// src/app/settings/notifications/RsvpedEventsList.tsx
'use client';

import { useEffect, useState } from 'react';

type RsvpedEvent = { id: number; title: string; starts_at: string };

export function RsvpedEventsList() {
  const [events, setEvents] = useState<RsvpedEvent[] | null>(null);

  useEffect(() => {
    // Reuse the per-user filtered ICS feed from Task 11. The component
    // calls a small JSON helper route added below so it doesn't have to
    // parse ICS in the browser.
    fetch('/api/preferences/notifications/rsvped-events?limit=5')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]));
  }, []);

  if (events === null) return <div className="text-sm text-grove-text-muted">Loading upcoming…</div>;
  if (events.length === 0)
    return <div className="text-sm text-grove-text-muted">No upcoming RSVPs — you&apos;ll see them here when you say yes to events.</div>;

  return (
    <div>
      <h2 className="text-sm font-semibold text-grove-text mb-3">Events you&apos;ll be notified about</h2>
      <ul className="space-y-1">
        {events.map((e) => (
          <li key={e.id} className="text-sm text-grove-text">
            <span className="text-grove-text-muted mr-2">{new Date(e.starts_at).toLocaleString()}</span>
            {e.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Also create the JSON sibling route. This is the same query the ICS-feed-filter task uses, but returns JSON for client consumption.

Create `src/app/api/preferences/notifications/rsvped-events/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/../auth';
import { db } from '@/lib/db';
import { events, rsvps } from '@/lib/db/schema';
import { and, asc, eq, gte, inArray, not } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userIdFromSession(session: any): string {
  return session.user.hyloId || session.user.id;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userIdFromSession(session);
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 50);

  const rsvpedIds = await db
    .select({ eventId: rsvps.eventId })
    .from(rsvps)
    .where(and(eq(rsvps.userId, userId), not(eq(rsvps.status, 'no'))));
  const ids = rsvpedIds.map((r) => r.eventId);
  if (ids.length === 0) return NextResponse.json({ events: [] });

  const upcoming = await db
    .select({ id: events.id, title: events.title, starts_at: events.startsAt })
    .from(events)
    .where(and(inArray(events.id, ids), gte(events.startsAt, new Date())))
    .orderBy(asc(events.startsAt))
    .limit(limit);

  return NextResponse.json({ events: upcoming });
}
```

This approach avoids extending `/api/events` with a `mine` filter (smaller blast radius) and reuses the same RSVP-id subquery pattern as Task 11.

- [x] **Step 4: Run the test, see GREEN** — confirmed: 1/1 pass for notifications-page.test.tsx. Full suite: 44/44 suites, 351/351 tests pass. Typecheck exit=0. Chrome MCP: connected (8 prod tabs visible) but no local dev server running, so page-level browser verification deferred to Task 16 E2E (per spec §11.2 acceptance gate). The component test contract — heading + prefs testid + rsvps testid render — is verified.

Run: `npx jest src/__tests__/app/settings/notifications-page.test.tsx`
Expected: PASS.

- [x] **Step 5: Run typecheck + commit** — completed in cycle 15 alongside Steps 3-4. tsc exit=0 verified; 3 files committed at 5bbe26f. Task 6 structurally complete (5/5 boxes).

```bash
npx tsc --noEmit
git add src/app/settings/notifications/ src/__tests__/app/settings/notifications-page.test.tsx
git commit -m "feat(ui): /settings/notifications page + RsvpedEventsList"
```

---

## Task 7: NavGearMenu — add Notifications item

**Files:**
- Modify: `src/components/NavGearMenu.tsx` (add a Link item)
- Test: extend existing NavGearMenu tests if any, otherwise add a smoke test

- [x] **Step 1: Read the current NavGearMenu and locate the menu items list.** — Read NavGearMenu.tsx in full. Findings: `Bell` and `Link` are already imported (lines 4-5). Menu items live in the `{open && ...}` block (lines 127-186). The menu already contains an **"Enable/Disable notifications"** push-subscription toggle (lines 137-146 — the togglePush button) that manages `push_subscriptions` table directly. Step 4 will add a **second** notification-related item: a `Link` to `/settings/notifications` for the new granular preferences UI. Both items will coexist (toggle = browser-level push subscription; link = per-window/channel preferences) per spec §7.3 / §7.1 separation. UX-coexistence flag for negativa-8 visibility: two notification-related items in the same menu may need disambiguation labels in a future polish cycle.

Run: `grep -n "Link" src/components/NavGearMenu.tsx | head -10`

- [x] **Step 2: Write a minimal smoke test asserting the new item renders** (FORESHADOWED PLAN DEFECT: the prescribed test renders `<NavGearMenu />` in closed state, but the menu items live inside `{open && ...}` block — even after Step 4 adds the Link, the closed-state DOM won't contain it. Will need a fireEvent.click in Step 4 cycle to open the menu before checking for the link. ALSO: NavGearMenu requires props `isAdmin: boolean, onSignOut: () => void` — plan's `<NavGearMenu />` without props would TS-error in strict mode, but ts-jest tolerates it for now. Both deviations to be handled at Step 4.)

```tsx
// src/__tests__/components/NavGearMenu-notifications-item.test.tsx
import { render, screen } from '@testing-library/react';
import { NavGearMenu } from '@/components/NavGearMenu';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));

describe('NavGearMenu', () => {
  it('contains a Notifications link', () => {
    render(<NavGearMenu />);
    expect(screen.getByRole('link', { name: /notifications/i })).toHaveAttribute(
      'href',
      '/settings/notifications',
    );
  });
});
```

- [x] **Step 3: Run the test, see RED** — confirmed: `Unable to find a link with the accessible name /notifications/i`. Test fails because (a) the Link doesn't exist, AND (b) even if it did, the menu is closed by default. Both issues will be addressed at Step 4.

Run: `npx jest src/__tests__/components/NavGearMenu-notifications-item.test.tsx`
Expected: FAIL — link not present.

- [x] **Step 4: Add the link** (THREE DEVIATIONS resolved at GREEN time: (1) test now provides required props `isAdmin={false} onSignOut={() => {}}` — plan's `<NavGearMenu />` would fail TS strict; (2) test now `fireEvent.click`s the gear button to open the menu before checking for the Link — menu items live inside `{open && ...}`; (3) test regex changed from `/notifications/i` to `/^notifications$/i` for clarity — though `getByRole('link')` already filters out the existing push-toggle button. Plan's prescribed Link snippet was used as-is; deviations are all on the test side. ALSO: added `onClick={() => setOpen(false)}` to the Link to close the menu on click — matches the existing /admin Link pattern in the same file.)

In `src/components/NavGearMenu.tsx`, add inside the menu items list:

```tsx
<Link
  href="/settings/notifications"
  className="flex items-center gap-2 px-3 py-2 text-sm text-grove-text hover:bg-grove-border/20"
>
  <Bell size={16} />
  Notifications
</Link>
```

(Import `Bell` from `lucide-react` if not already imported.)

- [x] **Step 5: Run the test, see GREEN, typecheck, commit** — completed in cycle 19 alongside Step 4. Jest 1/1 pass for the new test; full suite 45/45 suites, 352/352 tests pass; tsc exit=0; impl + test + plan ticks committed at 1fb04ba. Task 7 structurally complete (5/5 boxes).

```bash
npx jest src/__tests__/components/NavGearMenu-notifications-item.test.tsx
npx tsc --noEmit
git add src/components/NavGearMenu.tsx src/__tests__/components/NavGearMenu-notifications-item.test.tsx
git commit -m "feat(ui): NavGearMenu link to /settings/notifications"
```

---

## Task 8: InstallPrompt — iOS Safari branch

**Files:**
- Modify: `src/components/InstallPrompt.tsx`
- Test: `src/__tests__/components/InstallPrompt-ios.test.tsx`

- [x] **Step 1: Write the failing test** (DEVIATION: added a `beforeAll` block that stubs `window.matchMedia` because jsdom doesn't provide it, and the existing `InstallPrompt.tsx` line 22 calls `window.matchMedia('(display-mode: standalone)').matches`. Without the stub, all 3 tests crash before any assertion. With the stub, 2 tests already pass (the "should NOT show iOS card" cases — desktop Chrome and iOS-standalone), and 1 test fails for the right reason — the iOS-not-standalone case expects iOS card text that the impl doesn't yet render.)

```tsx
// src/__tests__/components/InstallPrompt-ios.test.tsx
import { render, screen, act } from '@testing-library/react';
import { InstallPrompt } from '@/components/InstallPrompt';

const ORIGINAL_UA = window.navigator.userAgent;

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

afterEach(() => {
  setUA(ORIGINAL_UA);
  // @ts-expect-error test reset
  delete (window.navigator as any).standalone;
  localStorage.clear();
});

describe('InstallPrompt iOS branch', () => {
  it('shows iOS-specific instructions on iPhone Safari not in standalone mode', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari/605.1');
    Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
    await act(async () => {
      render(<InstallPrompt />);
    });
    expect(await screen.findByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.getByText(/Tap the Share button/i)).toBeInTheDocument();
  });

  it('does not show iOS card when in standalone mode', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari/605.1');
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    render(<InstallPrompt />);
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
  });

  it('does not show iOS card on desktop Chrome', async () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
    render(<InstallPrompt />);
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the test, see RED** — confirmed: 1/3 tests fail. The "iOS Safari not in standalone mode" test cannot find "Add to Home Screen" text because the iOS branch doesn't exist (component returns null in this state). Tests 2 and 3 (the "should NOT show" cases) already pass. RED for the right reason — Step 4 will add the iOS branch and flip test 1 to GREEN.

Run: `npx jest src/__tests__/components/InstallPrompt-ios.test.tsx`
Expected: FAIL — current InstallPrompt has no iOS branch.

- [x] **Step 3: Modify InstallPrompt.tsx** (TWO PLAN DEFECTS resolved at GREEN time: (1) the `// @ts-expect-error test reset` comment from Step 1's prescribed test was unused — `as any` cast already silences TS — replaced with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` (resolves negativa-10 TS2578); (2) the prescribed `findByText(/Add to Home Screen/i)` matched BOTH the iOS card heading AND the third instruction list item ("Scroll down and tap 'Add to Home Screen'") — anchored to `/^Add to Home Screen$/i` to match the heading exclusively. Plan's prescribed impl code (state declaration + useEffect rewrite + iOS render branch) was used as-is; deviations are test-side.)

Replace the existing `useEffect` with:

```tsx
useEffect(() => {
  const dismissed = localStorage.getItem(STORAGE_KEY);
  if (dismissed) {
    const dismissedAt = parseInt(dismissed, 10);
    if (Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
  }

  // Already installed (any platform)
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  // iOS-specific standalone check
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window.navigator as any).standalone === true) return;

  const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
    'standalone' in window.navigator;

  if (isIOS) {
    setIosMode(true);
    setShow(true);
    return;
  }

  const handler = (e: Event) => {
    e.preventDefault();
    setDeferredPrompt(e);
    setShow(true);
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => window.removeEventListener('beforeinstallprompt', handler);
}, []);
```

Add `const [iosMode, setIosMode] = useState(false);` to the state declarations.

In the render, branch on `iosMode`:

```tsx
if (iosMode) {
  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="bg-grove-surface border border-grove-border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-grove-accent/20 flex items-center justify-center shrink-0">
            <Download size={20} className="text-grove-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-grove-text">Add to Home Screen</p>
            <p className="text-xs text-grove-text-muted">For notifications and the full experience</p>
          </div>
          <button onClick={handleDismiss} className="p-1 text-grove-text-muted hover:text-grove-text">
            <X size={14} />
          </button>
        </div>
        <ol className="text-xs text-grove-text-muted space-y-1 ml-12 list-decimal">
          <li>Tap the Share button at the bottom of Safari</li>
          <li>Scroll down and tap &quot;Add to Home Screen&quot;</li>
          <li>Tap &quot;Add&quot; in the top-right corner</li>
        </ol>
      </div>
    </div>
  );
}
```

(Existing non-iOS render stays as the fallback.)

- [x] **Step 4: Run the test, see GREEN** — confirmed: 3/3 pass for InstallPrompt-ios.test.tsx. Full suite: 46/46 suites, 355/355 tests pass. Typecheck: `npx tsc --noEmit` exit=0 (TS2578 resolved alongside this cycle).

Run: `npx jest src/__tests__/components/InstallPrompt-ios.test.tsx`
Expected: PASS.

- [x] **Step 5: Run typecheck + commit** — completed in cycle 22 alongside Steps 3-4. tsc exit=0 verified (also resolved negativa-10 TS2578); component + test in 9a8728d. Task 8 structurally complete (5/5 boxes).

```bash
npx tsc --noEmit
git add src/components/InstallPrompt.tsx src/__tests__/components/InstallPrompt-ios.test.tsx
git commit -m "feat(ui): InstallPrompt iOS Safari branch"
```

---

## Task 9: SubscribePrompt — integrate `<NotificationPreferences>`

**Files:**
- Modify: `src/components/SubscribePrompt.tsx`

- [ ] **Step 1: Update the existing notification step test (or add one) for the new shape**

```tsx
// src/__tests__/components/SubscribePrompt-prefs.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { SubscribePrompt } from '@/components/SubscribePrompt';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));
jest.mock('@/lib/use-feed-urls', () => ({
  useFeedUrls: () => ({ webcalUrl: 'webcal://x', googleUrl: 'https://g', outlookUrl: 'https://o' }),
}));

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
    }),
  } as Response);
  localStorage.clear();
  // Force PushManager API present
  (window as any).PushManager = function () {};
  Object.defineProperty(window, 'Notification', {
    value: { permission: 'default', requestPermission: () => Promise.resolve('granted') },
    configurable: true,
  });
});

describe('SubscribePrompt notifications step', () => {
  it('renders the NotificationPreferences component on the notifications step', async () => {
    render(<SubscribePrompt />);
    await waitFor(() => screen.getByRole('heading', { name: /never miss/i }), { timeout: 3000 });
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    });
  });
});
```

- [ ] **Step 2: Run the test, see RED**

Run: `npx jest src/__tests__/components/SubscribePrompt-prefs.test.tsx`
Expected: FAIL — current notifications step is a plain button, no checkboxes.

- [ ] **Step 3: Modify SubscribePrompt notifications step**

In the `step === 'notifications'` branch (lines ~122-166), replace the body with:

```tsx
<div className="px-6 pt-6 pb-4">
  <div className="flex items-center gap-3 mb-4">
    <div className="w-10 h-10 rounded-full bg-grove-accent/20 flex items-center justify-center">
      <Bell size={20} className="text-grove-accent" />
    </div>
    <div>
      <h2 className="text-lg font-semibold text-grove-text">Never miss a gathering</h2>
      <p className="text-sm text-grove-text-muted">Step 1 of 2</p>
    </div>
  </div>

  <p className="text-sm text-grove-text leading-relaxed mb-5">
    Choose when to be reminded for events you RSVP to.
  </p>

  <NotificationPreferences />

  <div className="space-y-2 mt-5">
    <button
      onClick={handleEnableNotifications}
      disabled={pushLoading}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-grove-accent-deep text-grove-surface font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      <Bell size={16} />
      {pushLoading ? 'Setting up…' : 'Enable notifications'}
    </button>
    <button
      onClick={handleSkipNotifications}
      className="w-full px-4 py-2.5 rounded-lg border border-grove-border text-sm text-grove-text hover:bg-grove-border/20 transition-colors"
    >
      Maybe later
    </button>
  </div>
</div>
```

Add `import { NotificationPreferences } from '@/components/NotificationPreferences';` at the top.

- [ ] **Step 4: Run the test, see GREEN**

Run: `npx jest src/__tests__/components/SubscribePrompt-prefs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/SubscribePrompt.tsx src/__tests__/components/SubscribePrompt-prefs.test.tsx
git commit -m "feat(ui): integrate NotificationPreferences into SubscribePrompt"
```

---

## Task 10: SubscribePrompt — iOS guard

**Files:**
- Modify: `src/components/SubscribePrompt.tsx`
- Test: `src/__tests__/components/SubscribePrompt-ios.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/components/SubscribePrompt-ios.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { SubscribePrompt } from '@/components/SubscribePrompt';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));
jest.mock('@/lib/use-feed-urls', () => ({
  useFeedUrls: () => ({ webcalUrl: 'webcal://x', googleUrl: 'https://g', outlookUrl: 'https://o' }),
}));
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
    emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
  }),
}) as unknown as typeof fetch;

function setIOS() {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari/605.1',
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
}

describe('SubscribePrompt iOS guard', () => {
  it('shows install instructions instead of Enable button on iOS Safari not standalone', async () => {
    setIOS();
    render(<SubscribePrompt />);
    await waitFor(() => screen.getByRole('heading', { name: /never miss/i }), { timeout: 3000 });
    expect(screen.getByText(/Install app first/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Enable notifications$/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, see RED**

Run: `npx jest src/__tests__/components/SubscribePrompt-ios.test.tsx`
Expected: FAIL — Enable button still present.

- [ ] **Step 3: Add the iOS guard**

In SubscribePrompt, derive an `isIosNotInstalled` flag (top of component body):

```tsx
const isIosNotInstalled = typeof window !== 'undefined' &&
  /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
  'standalone' in window.navigator &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  !(window.navigator as any).standalone;
```

In the notifications step, conditionally swap the Enable block:

```tsx
{isIosNotInstalled ? (
  <div className="space-y-2 mt-5">
    <div className="rounded-lg border border-grove-border p-3 text-xs text-grove-text">
      <p className="font-semibold text-sm mb-1">Install app first</p>
      <ol className="list-decimal ml-5 space-y-0.5 text-grove-text-muted">
        <li>Tap the Share button at the bottom of Safari</li>
        <li>Scroll down → &quot;Add to Home Screen&quot;</li>
        <li>Open from the home-screen icon to enable notifications</li>
      </ol>
    </div>
    <button onClick={handleSkipNotifications} className="w-full px-4 py-2.5 rounded-lg border border-grove-border text-sm text-grove-text hover:bg-grove-border/20">
      Skip for now
    </button>
  </div>
) : (
  <div className="space-y-2 mt-5">
    {/* existing Enable / Maybe later buttons */}
  </div>
)}
```

- [ ] **Step 4: Run the test, see GREEN, typecheck, commit**

```bash
npx jest src/__tests__/components/SubscribePrompt-ios.test.tsx
npx tsc --noEmit
git add src/components/SubscribePrompt.tsx src/__tests__/components/SubscribePrompt-ios.test.tsx
git commit -m "feat(ui): SubscribePrompt iOS guard swaps Enable for install instructions"
```

---

## Task 11: ICS feed `?filter=rsvps-only`

**Files:**
- Modify: `src/app/api/calendar/feed.ics/route.ts`
- Test: `src/__tests__/app/api/feed-ics-filter.test.ts`

- [ ] **Step 1: Read the existing feed route to understand its current shape**

Run: `cat src/app/api/calendar/feed.ics/route.ts`

- [ ] **Step 2: Write the failing test**

The existing route loads all events with `db.select().from(events).orderBy(asc(events.startsAt))` and uses the `token` only to look up the member (`_userId`) but doesn't currently use it to filter. The test asserts the new filter behavior.

```ts
// src/__tests__/app/api/feed-ics-filter.test.ts
import { GET } from '@/app/api/calendar/feed.ics/route';
import type { NextRequest } from 'next/server';

const mockEventA = { id: 1, title: 'EventA', startsAt: new Date('2026-06-01T10:00:00Z'), endsAt: null, location: null, description: null, timezone: 'UTC', creatorName: 'Alice', recurrenceRule: null };
const mockEventB = { id: 2, title: 'EventB', startsAt: new Date('2026-06-02T10:00:00Z'), endsAt: null, location: null, description: null, timezone: 'UTC', creatorName: 'Bob', recurrenceRule: null };

let lastWhereCallShape: 'token' | 'filtered' | 'plain' = 'plain';

jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (_table: unknown) => ({
        // member-by-token lookup
        where: () => ({ limit: () => Promise.resolve([{ hyloId: 'u1' }]) }),
        // filtered RSVPs-only path uses innerJoin
        innerJoin: () => ({
          where: () => Promise.resolve([mockEventA]),
        }),
        // unfiltered path
        orderBy: () => Promise.resolve([mockEventA, mockEventB]),
      }),
    }),
  },
}));

function makeReq(qs: string) {
  return { nextUrl: new URL(`http://localhost/api/calendar/feed.ics?${qs}`) } as unknown as NextRequest;
}

describe('ICS feed filter param', () => {
  it('returns all events when filter is absent', async () => {
    const res = await GET(makeReq('token=tk1'));
    const body = await res.text();
    expect(body).toContain('EventA');
    expect(body).toContain('EventB');
  });

  it('returns only RSVPed events when filter=rsvps-only and token is valid', async () => {
    const res = await GET(makeReq('token=tk1&filter=rsvps-only'));
    const body = await res.text();
    expect(body).toContain('EventA');
    expect(body).not.toContain('EventB');
  });

  it('falls back to all events when filter=rsvps-only but token is invalid (no member)', async () => {
    // Adjust the mock for this case to return [] from the member lookup
    // (handled by the route by falling through to the unfiltered query path)
    // For brevity here, this test asserts the route does not throw and returns 200.
    const res = await GET(makeReq('filter=rsvps-only'));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Add the filter param handling**

Modify `src/app/api/calendar/feed.ics/route.ts`. After the existing member lookup (line ~31), branch on the filter param:

```ts
import { asc, eq, and, not, inArray } from 'drizzle-orm';
import { events, members, rsvps } from '@/lib/db/schema';

// ... existing token/_userId lookup unchanged ...

const filter = request.nextUrl.searchParams.get('filter');

let allEvents;
if (filter === 'rsvps-only' && _userId) {
  // Subquery: event ids the user has RSVPed yes/interested to
  const rsvpedEventIds = await db
    .select({ eventId: rsvps.eventId })
    .from(rsvps)
    .where(and(eq(rsvps.userId, _userId), not(eq(rsvps.status, 'no'))));
  const ids = rsvpedEventIds.map((r) => r.eventId);
  allEvents = ids.length === 0
    ? []
    : await db.select().from(events).where(inArray(events.id, ids)).orderBy(asc(events.startsAt));
} else {
  allEvents = await db.select().from(events).orderBy(asc(events.startsAt));
}
```

Replace the existing `const allEvents = await db.select()...` line (line 35) with the conditional block above.

- [ ] **Step 4: Replace .todo assertions with real tests, run, see GREEN**

```bash
npx jest src/__tests__/app/api/feed-ics-filter.test.ts
npx tsc --noEmit
git add src/app/api/calendar/feed.ics/route.ts src/__tests__/app/api/feed-ics-filter.test.ts
git commit -m "feat(api): feed.ics ?filter=rsvps-only param"
```

---

## Task 12: `/api/cron/heartbeat-check` daily backup cron

**Files:**
- Create: `src/app/api/cron/heartbeat-check/route.ts`
- Test: `src/__tests__/app/api/cron/heartbeat-check.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/app/api/cron/heartbeat-check.test.ts
import { GET } from '@/app/api/cron/heartbeat-check/route';

const sendEmailMock = jest.fn().mockResolvedValue({ success: true });
jest.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));

let lastSentAt: Date | null = null;
jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ orderBy: () => ({ limit: () => Promise.resolve([{ sentAt: lastSentAt }]) }) }) }),
  },
}));

beforeEach(() => {
  sendEmailMock.mockClear();
  process.env.CRON_SECRET = 'shh';
  process.env.NOTIFICATION_ADMIN_EMAIL = 'admin@example.com';
});

describe('heartbeat-check cron', () => {
  it('returns 401 without bearer auth', async () => {
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('does not email when last log is fresh', async () => {
    lastSentAt = new Date(); // fresh
    const res = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer shh' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notified).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('emails admin when last log is stale (>30 min)', async () => {
    lastSentAt = new Date(Date.now() - 60 * 60_000); // 1h ago
    const res = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer shh' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notified).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith('admin@example.com', expect.any(String), expect.any(String));
  });
});
```

- [ ] **Step 2: Run, see RED**

Run: `npx jest src/__tests__/app/api/cron/heartbeat-check.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/api/cron/heartbeat-check/route.ts
import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notificationLog } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const STALE_MS = 30 * 60_000;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({ sentAt: notificationLog.sentAt })
    .from(notificationLog)
    .orderBy(desc(notificationLog.sentAt))
    .limit(1);

  const lastSentAt = rows[0]?.sentAt ?? null;
  const ageMs = lastSentAt ? Date.now() - new Date(lastSentAt).getTime() : Infinity;
  const isStale = ageMs > STALE_MS;

  let notified = false;
  if (isStale) {
    const adminEmail = process.env.NOTIFICATION_ADMIN_EMAIL;
    if (adminEmail) {
      const subject = 'Liminal Calendar — reminders cron is stale';
      const html = `
        <p>The reminders cron has not produced a notification_log entry in over 30 minutes.</p>
        <p>Last sent at: ${lastSentAt ?? 'never'}</p>
        <p>Check chora-node crontab and /api/cron/heartbeat for details.</p>
      `;
      await sendEmail(adminEmail, subject, html);
      notified = true;
    }
  }

  return NextResponse.json({ status: isStale ? 'stale' : 'ok', notified, lastSentAt });
}
```

- [ ] **Step 4: Update `vercel.json`**

Add to the `crons` array:
```json
{ "path": "/api/cron/heartbeat-check", "schedule": "0 12 * * *" }
```

- [ ] **Step 5: Run test, see GREEN, typecheck, commit**

```bash
npx jest src/__tests__/app/api/cron/heartbeat-check.test.ts
npx tsc --noEmit
git add src/app/api/cron/heartbeat-check/ src/__tests__/app/api/cron/heartbeat-check.test.ts vercel.json
git commit -m "feat(cron): /api/cron/heartbeat-check daily stale-detector"
```

---

## Task 13: Update `docs/notifications/scheduling.md` with operator playbook

**Files:**
- Modify: `docs/notifications/scheduling.md`

- [ ] **Step 1: Append the operator playbook section**

Add this section near the bottom of `docs/notifications/scheduling.md` (after the existing Monitoring section):

```markdown
## Operator playbook (post-deploy)

### Primary monitor — UptimeRobot

1. Create a Keyword Check at `https://liminalcalendar.com/api/cron/heartbeat`.
2. Alert when response body contains `"status":"stale"`.
3. Frequency: every 15 minutes.
4. Notify: admin email + Slack if available.

This catches a stuck chora-node crontab within ~30 minutes of failure.

### Backup monitor — Vercel daily cron

`/api/cron/heartbeat-check` runs daily (12:00 UTC) and emails `NOTIFICATION_ADMIN_EMAIL` if no `notification_log` row has been written in the last 30 minutes. This is the safety net when UptimeRobot itself is misconfigured or down.

Required env: `NOTIFICATION_ADMIN_EMAIL` (set in Vercel project settings).

### Smoke test

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://liminalcalendar.com/api/cron/heartbeat
```

Expected: `{"status":"ok", "lastSentAt":"...", "ageSeconds":<small>}`. If `"stale"`, the chora-node trigger is down.
```

- [ ] **Step 2: Commit**

```bash
git add docs/notifications/scheduling.md
git commit -m "docs(notifications): operator playbook for heartbeat monitoring"
```

---

## Task 14: Cleanup — delete NotificationScheduler + remove from layout

**Files:**
- Delete: `src/components/NotificationScheduler.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Verify no other imports reference it**

Run: `grep -rn "NotificationScheduler" src/ --include="*.tsx" --include="*.ts"`
Expected: hits only in `src/components/NotificationScheduler.tsx` and `src/app/layout.tsx`.

- [ ] **Step 2: Remove the mount and import from layout.tsx**

In `src/app/layout.tsx`:
- Delete line 11: `import { NotificationScheduler } from "@/components/NotificationScheduler";`
- Delete line 50: `<NotificationScheduler />`

- [ ] **Step 3: Delete the component file**

Run: `rm src/components/NotificationScheduler.tsx`

- [ ] **Step 4: Verify zero remaining references**

Run: `grep -rn "NotificationScheduler" src/`
Expected: 0 results.

- [ ] **Step 5: Run full test suite + typecheck**

```bash
npx tsc --noEmit
npx jest
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -u src/app/layout.tsx
git rm src/components/NotificationScheduler.tsx
git commit -m "chore(notifications): delete client-side NotificationScheduler (wrong-tier)"
```

---

## Task 15: Cleanup — EventRSVP strip + recurring inline text

**Files:**
- Modify: `src/components/events/EventRSVP.tsx`
- Test: `src/__tests__/components/EventRSVP-cleanup.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/components/EventRSVP-cleanup.test.tsx
import { render, screen } from '@testing-library/react';
import { EventRSVP } from '@/components/events/EventRSVP';

const baseEvent = {
  id: 1, title: 'Test', startsAt: new Date('2026-06-01'),
  recurrenceRule: null,
};

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));

describe('EventRSVP cleanups', () => {
  it('does not render a remindMe checkbox', () => {
    render(<EventRSVP event={baseEvent as any} />);
    expect(screen.queryByLabelText(/remind me/i)).not.toBeInTheDocument();
  });

  it('does not render the newsletter signup', () => {
    render(<EventRSVP event={baseEvent as any} />);
    expect(screen.queryByText(/subscribe to the monthly newsletter/i)).not.toBeInTheDocument();
  });

  it('shows recurring inline text when recurrenceRule is set', () => {
    render(<EventRSVP event={{ ...baseEvent, recurrenceRule: 'weekly' } as any} />);
    expect(screen.getByText(/recurring — applies to all occurrences/i)).toBeInTheDocument();
  });

  it('does not show recurring inline text for non-recurring events', () => {
    render(<EventRSVP event={baseEvent as any} />);
    expect(screen.queryByText(/recurring — applies to all occurrences/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, see RED**

Run: `npx jest src/__tests__/components/EventRSVP-cleanup.test.tsx`
Expected: FAIL — newsletter signup and remindMe checkbox both still present.

- [ ] **Step 3: Modify `src/components/events/EventRSVP.tsx`**

Following the line numbers from the spec:
- Delete line 17: `remindMe?: boolean;` from the input type
- Delete line 82: `const [remindMe, setRemindMe] = useState(true);`
- Delete line 100: `if (myRsvp) setRemindMe((myRsvp as any).remindMe ?? false);`
- Delete lines 137-156 (the remindMe sync effect)
- In the API call body (line 124 area), change to: `remindMe: response === 'no' ? false : true,` (always TRUE on yes/interested — keeps the schema column populated)
- Delete the JSX block at line 264 (the remind-me checkbox)
- Delete the JSX block at line 280 (the "Subscribe to the monthly newsletter" affordance)
- Add inline text near the RSVP buttons:
```tsx
{event.recurrenceRule && (
  <p className="text-xs text-grove-text-muted italic mt-2">
    Recurring — applies to all occurrences
  </p>
)}
```

- [ ] **Step 4: Run test, see GREEN, full suite, typecheck, commit**

```bash
npx jest src/__tests__/components/EventRSVP-cleanup.test.tsx
npx jest
npx tsc --noEmit
git add src/components/events/EventRSVP.tsx src/__tests__/components/EventRSVP-cleanup.test.tsx
git commit -m "chore(ui): EventRSVP — drop remindMe toggle + newsletter, add recurring text"
```

---

## Task 16: Chrome MCP E2E acceptance verification

**Files:** none (this is the final acceptance gate, run after all prior tasks pass)

This task is run by the loop after all prior tasks are committed. It uses the Chrome MCP browser automation tools to walk the full flow against the deployed PBE environment (or a local `npm run dev`). It produces no code changes — it produces a pass/fail signal.

- [ ] **Step 1: Pre-flight checks**

Navigate to the deployed liminalcalendar.com (or PBE).
- DevTools → Application → Service Workers → confirm `/sw.js` registered + active
- Application → Manifest → confirm `manifest.json` loads with display:standalone

- [ ] **Step 2: Onboarding flow (desktop Chrome)**

Sign in. Wait 2s. Verify:
- SubscribePrompt opens
- 6 checkboxes render
- Push checkboxes default checked, email default unchecked
- Click "24 hours before" email checkbox. Verify network tab: PUT `/api/preferences/notifications` fires with `emailTwentyFourHour: true` body.

- [ ] **Step 3: Settings panel**

Open NavGearMenu → click "Notifications" → verify URL is `/settings/notifications`.
- Page heading "Notifications" present
- 6 checkboxes match DB state (with the email_24h toggle from Step 2 reflected)
- "Events you'll be notified about" list renders

- [ ] **Step 4: Cleanups verified**

Open any event detail. Verify:
- No "Remind me" checkbox visible
- No "Subscribe to the monthly newsletter" text
- For a recurring event: "Recurring — applies to all occurrences" text shows
- For a non-recurring event: that text is absent

- [ ] **Step 5: ICS feed filter**

Get the user's feed token from the SubscribePrompt URLs (or from DB). Visit:
- `/api/calendar/feed.ics?token=…` → contains all events
- `/api/calendar/feed.ics?token=…&filter=rsvps-only` → contains only RSVPed events

- [ ] **Step 6: Heartbeat endpoint**

Visit `/api/cron/heartbeat`. Verify body contains `"status":"ok"` (or `"empty"` for a fresh DB).

- [ ] **Step 7: Console hygiene**

Read all console messages during Steps 2-5 with pattern filter excluding known third-party noise. Expected: 0 errors with `[liminal]` or `Calendar` prefix.

- [ ] **Step 8: Acceptance gate**

If all 7 steps pass: tag the run as accepted. Otherwise: file findings to `.opponent-log-notification-robustness.md` for the negativa loop to triage.

---

## Final acceptance contract (whole slice)

- [ ] All Jest tests in this plan pass: `npx jest`
- [ ] No type errors: `npx tsc --noEmit`
- [ ] Chrome MCP E2E (Task 16) passes
- [ ] `grep -rn NotificationScheduler src/` returns 0 hits
- [ ] `grep -rn "Subscribe to the monthly newsletter" src/` returns 0 hits
- [ ] Recurring events display "Recurring — applies to all occurrences"
- [ ] `vercel.json` contains both `materialize` (existing) and `heartbeat-check` (new) cron entries
- [ ] `docs/notifications/scheduling.md` includes the operator playbook section
- [ ] Real-device manual smoke (iPhone Safari install + push delivery) ticked in PR description

When all boxes are checked, the slice is shippable.
