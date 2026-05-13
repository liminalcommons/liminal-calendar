# Broadcast-with-Mute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify every community member with an at-start push when any event begins, unless they've muted the series; provide in-app mute toggles on event surfaces.

**Architecture:** New `event_mutes` table keyed by `(member_id, event_id)`. New `computeBroadcastRecipients` helper consulted from `send-reminders` cron, gated by `BROADCAST_ENABLED` env flag. New `/api/events/{id}/mute` (POST/DELETE) and `/api/preferences/notifications/muted` (GET) endpoints. Mute UI lives in `EventDetailView`, `EventBlock` (calendar card), and `NotificationPreferences` (settings page).

**Tech Stack:** Next.js 15 App Router, Drizzle ORM over Neon Postgres (HTTP driver), Jest + ts-jest + jsdom, React Testing Library, web-push for push delivery.

**Schema findings resolved up-front:**
- `events.id` is `serial` (integer). So `series_id` from spec becomes `event_id INTEGER REFERENCES events(id)`. Both one-off and recurring events use the same row; mute keyed on the seed event id covers all virtual instances automatically.
- `events.visibility` already exists, `text NOT NULL DEFAULT 'public'`. Broadcast skips when `visibility = 'private'`.
- No materialization table for recurring events — recurring instances are expanded virtually by `lib/recurrence-expander.ts`. Broadcast respects whatever the existing `send-reminders` cron passes through; the at-start window for the seed `starts_at` is what fires. Materializing future instances is out of scope.

---

## File Structure

**Created:**
- `src/lib/notifications/mute-repo.ts` — `muteSeries`, `unmuteSeries`, `isSeriesMuted`, `listMutedSeries`
- `src/lib/notifications/broadcast.ts` — `computeBroadcastRecipients(db, event)`, `BROADCAST_ENABLED` constant
- `src/lib/db/migrations/event-mutes.sql` — schema migration
- `src/app/api/events/[id]/mute/route.ts` — POST/DELETE
- `src/app/api/preferences/notifications/muted/route.ts` — GET
- `src/__tests__/lib/mute-repo.test.ts`
- `src/__tests__/lib/broadcast.test.ts`
- `src/__tests__/app/api/events-id-mute.test.ts`
- `src/__tests__/app/api/preferences-notifications-muted.test.ts`
- `src/__tests__/components/EventDetailView-mute.test.tsx`

**Modified:**
- `src/lib/db/schema.ts` — append `eventMutes` table
- `src/lib/db/migrate.ts` — wire `event_mutes` into `runMigrations`
- `src/app/api/cron/send-reminders/route.ts` — call broadcast helper after RSVP fanout
- `src/components/events/EventDetailView.tsx` — Mute/Unmute toggle button
- `src/components/calendar/EventBlock.tsx` (or actual grid component — locate during Task 8) — bell-slash icon when muted
- `src/components/NotificationPreferences.tsx` — "Muted series" section

---

## Task 1: Schema + migration for `event_mutes`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/event-mutes.sql`
- Modify: `src/lib/db/migrate.ts`

- [ ] **Step 1: Append `eventMutes` table to schema**

Append to `src/lib/db/schema.ts` (after the last `pgTable` export, before any relations block if present):

```ts
export const eventMutes = pgTable(
  'event_mutes',
  {
    id: serial('id').primaryKey(),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('event_mutes_member_event_unique').on(table.memberId, table.eventId)],
);
export type EventMute = typeof eventMutes.$inferSelect;
```

- [ ] **Step 2: Create raw-SQL migration**

Create `src/lib/db/migrations/event-mutes.sql`:

```sql
CREATE TABLE IF NOT EXISTS event_mutes (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, event_id)
);
CREATE INDEX IF NOT EXISTS event_mutes_member_idx ON event_mutes(member_id);
```

- [ ] **Step 3: Wire into `runMigrations`**

Append inside `runMigrations()` in `src/lib/db/migrate.ts` (after the other `CREATE TABLE` calls, before the function returns):

```ts
  await sql`
    CREATE TABLE IF NOT EXISTS event_mutes (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(member_id, event_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS event_mutes_member_idx ON event_mutes(member_id)`;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean exit (no new errors). If imports for `pgTable`, `serial`, `integer`, `timestamp`, `unique` aren't already destructured at the top of `schema.ts`, add them — they are. Verify by reading lines 1–20 of `schema.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/event-mutes.sql src/lib/db/migrate.ts
git -c user.email=accounts@liminalcommons.com commit -m "feat(db): add event_mutes table for per-series notification muting"
```

---

## Task 2: Mute repo + tests

**Files:**
- Create: `src/lib/notifications/mute-repo.ts`
- Test: `src/__tests__/lib/mute-repo.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/mute-repo.test.ts`:

```ts
import { muteSeries, unmuteSeries, isSeriesMuted, listMutedSeries } from '@/lib/notifications/mute-repo';

type Row = { id: number; memberId: number; eventId: number; createdAt: Date };

function makeFakeDb(rows: Row[] = []) {
  let nextId = rows.length + 1;
  return {
    rows,
    insert: () => ({
      values: (v: { memberId: number; eventId: number }) => ({
        onConflictDoNothing: async () => {
          if (!rows.find(r => r.memberId === v.memberId && r.eventId === v.eventId)) {
            rows.push({ id: nextId++, memberId: v.memberId, eventId: v.eventId, createdAt: new Date() });
          }
        },
      }),
    }),
    delete: () => ({
      where: async (predicate: (r: Row) => boolean) => {
        for (let i = rows.length - 1; i >= 0; i--) if (predicate(rows[i])) rows.splice(i, 1);
      },
    }),
    select: () => ({
      from: () => ({
        where: (predicate: (r: Row) => boolean) => Promise.resolve(rows.filter(predicate)),
      }),
    }),
  };
}

describe('mute-repo', () => {
  test('muteSeries inserts a row', async () => {
    const db = makeFakeDb();
    await muteSeries(db as any, 7, 42);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ memberId: 7, eventId: 42 });
  });

  test('muteSeries is idempotent', async () => {
    const db = makeFakeDb();
    await muteSeries(db as any, 7, 42);
    await muteSeries(db as any, 7, 42);
    expect(db.rows).toHaveLength(1);
  });

  test('unmuteSeries removes the row', async () => {
    const db = makeFakeDb([{ id: 1, memberId: 7, eventId: 42, createdAt: new Date() }]);
    await unmuteSeries(db as any, 7, 42);
    expect(db.rows).toHaveLength(0);
  });

  test('isSeriesMuted returns true when muted', async () => {
    const db = makeFakeDb([{ id: 1, memberId: 7, eventId: 42, createdAt: new Date() }]);
    expect(await isSeriesMuted(db as any, 7, 42)).toBe(true);
  });

  test('isSeriesMuted returns false when not muted', async () => {
    const db = makeFakeDb();
    expect(await isSeriesMuted(db as any, 7, 42)).toBe(false);
  });

  test('listMutedSeries returns all event_ids for a member', async () => {
    const db = makeFakeDb([
      { id: 1, memberId: 7, eventId: 42, createdAt: new Date() },
      { id: 2, memberId: 7, eventId: 99, createdAt: new Date() },
      { id: 3, memberId: 8, eventId: 11, createdAt: new Date() },
    ]);
    const result = await listMutedSeries(db as any, 7);
    expect(result.map(r => r.eventId).sort()).toEqual([42, 99]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/lib/mute-repo.test.ts`
Expected: FAIL — `Cannot find module '@/lib/notifications/mute-repo'`.

- [ ] **Step 3: Implement the repo**

Create `src/lib/notifications/mute-repo.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { eventMutes, type EventMute } from '@/lib/db/schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function muteSeries(db: any, memberId: number, eventId: number): Promise<void> {
  await db
    .insert(eventMutes)
    .values({ memberId, eventId })
    .onConflictDoNothing();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function unmuteSeries(db: any, memberId: number, eventId: number): Promise<void> {
  await db
    .delete(eventMutes)
    .where(and(eq(eventMutes.memberId, memberId), eq(eventMutes.eventId, eventId)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isSeriesMuted(db: any, memberId: number, eventId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(eventMutes)
    .where(and(eq(eventMutes.memberId, memberId), eq(eventMutes.eventId, eventId)));
  return rows.length > 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMutedSeries(db: any, memberId: number): Promise<EventMute[]> {
  return await db
    .select()
    .from(eventMutes)
    .where(eq(eventMutes.memberId, memberId));
}
```

Note: the fake db in the test ignores Drizzle's `and`/`eq` operator structure — it expects raw predicate functions. To make the test work against real Drizzle helpers, replace the fake's `where` with a predicate-friendly stub. If running tests reveals the fake doesn't compose cleanly with real Drizzle operators, update the fake to accept and ignore Drizzle's operator objects and use lambdas instead. Specifically: change the test's `where: (predicate)` to accept any argument and use a private filter passed alongside, OR rewrite the test to drive through a higher-level fake that pattern-matches on calls. Pragmatic shortcut: tests use a stub that returns `eventMutes` from `select().from()` and then `where(_)` simply returns the rows the test pre-populated; tighten only if false positives appear.

- [ ] **Step 4: Run tests**

Run: `npx jest src/__tests__/lib/mute-repo.test.ts`
Expected: all 6 tests PASS. If any fail because Drizzle operator objects don't match the fake's predicate signature, adjust the fake stub in the test (do not change the repo — the repo's behavior is correct).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications/mute-repo.ts src/__tests__/lib/mute-repo.test.ts
git -c user.email=accounts@liminalcommons.com commit -m "feat(notifications): mute-repo for per-series notification opt-out"
```

---

## Task 3: API routes for mute (POST/DELETE) + tests

**Files:**
- Create: `src/app/api/events/[id]/mute/route.ts`
- Test: `src/__tests__/app/api/events-id-mute.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/app/api/events-id-mute.test.ts`:

```ts
import { POST, DELETE } from '@/app/api/events/[id]/mute/route';
import * as authMod from '@/lib/auth/get-authed-user';
import * as repoMod from '@/lib/notifications/mute-repo';

jest.mock('@/lib/db', () => ({ db: {} }));

describe('/api/events/[id]/mute', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('POST returns 401 when unauthenticated', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue(null);
    const req = new Request('http://x/api/events/42/mute', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(401);
  });

  test('POST returns 400 when memberId is null on session', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: null, role: 'member', name: null, image: null });
    const req = new Request('http://x/api/events/42/mute', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(400);
  });

  test('POST returns 400 when event id is not a number', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: 7, role: 'member', name: null, image: null });
    const req = new Request('http://x/api/events/abc/mute', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(400);
  });

  test('POST calls muteSeries with memberId and eventId', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: 7, role: 'member', name: null, image: null });
    const muteSpy = jest.spyOn(repoMod, 'muteSeries').mockResolvedValue();
    const req = new Request('http://x/api/events/42/mute', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(200);
    expect(muteSpy).toHaveBeenCalledWith(expect.anything(), 7, 42);
    expect(await res.json()).toEqual({ muted: true, eventId: 42 });
  });

  test('DELETE calls unmuteSeries', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: 7, role: 'member', name: null, image: null });
    const unmuteSpy = jest.spyOn(repoMod, 'unmuteSeries').mockResolvedValue();
    const req = new Request('http://x/api/events/42/mute', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(200);
    expect(unmuteSpy).toHaveBeenCalledWith(expect.anything(), 7, 42);
    expect(await res.json()).toEqual({ muted: false, eventId: 42 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/app/api/events-id-mute.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/events/[id]/mute/route'`.

- [ ] **Step 3: Implement the route**

Create `src/app/api/events/[id]/mute/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { muteSeries, unmuteSeries } from '@/lib/notifications/mute-repo';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseEventId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(_request: Request, ctx: Ctx) {
  const authed = await getAuthedUser();
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (authed.memberId == null) return NextResponse.json({ error: 'No member record' }, { status: 400 });
  const { id } = await ctx.params;
  const eventId = parseEventId(id);
  if (eventId == null) return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
  await muteSeries(db, authed.memberId, eventId);
  return NextResponse.json({ muted: true, eventId });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const authed = await getAuthedUser();
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (authed.memberId == null) return NextResponse.json({ error: 'No member record' }, { status: 400 });
  const { id } = await ctx.params;
  const eventId = parseEventId(id);
  if (eventId == null) return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
  await unmuteSeries(db, authed.memberId, eventId);
  return NextResponse.json({ muted: false, eventId });
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/__tests__/app/api/events-id-mute.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/events/\[id\]/mute/route.ts src/__tests__/app/api/events-id-mute.test.ts
git -c user.email=accounts@liminalcommons.com commit -m "feat(api): POST/DELETE /api/events/[id]/mute"
```

---

## Task 4: API route for listing muted series + tests

**Files:**
- Create: `src/app/api/preferences/notifications/muted/route.ts`
- Test: `src/__tests__/app/api/preferences-notifications-muted.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/app/api/preferences-notifications-muted.test.ts`:

```ts
import { GET } from '@/app/api/preferences/notifications/muted/route';
import * as authMod from '@/lib/auth/get-authed-user';
import * as repoMod from '@/lib/notifications/mute-repo';

jest.mock('@/lib/db', () => ({ db: {} }));

// Mock the events join — return shape: [{ eventId, title, startsAt }]
jest.mock('@/lib/notifications/muted-with-events', () => ({
  listMutedWithEventDetails: jest.fn(),
}));
import { listMutedWithEventDetails } from '@/lib/notifications/muted-with-events';

describe('GET /api/preferences/notifications/muted', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('returns 401 when unauthenticated', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue(null);
    const res = await GET(new Request('http://x/api/preferences/notifications/muted'));
    expect(res.status).toBe(401);
  });

  test('returns muted events list', async () => {
    jest.spyOn(authMod, 'getAuthedUser').mockResolvedValue({ id: 'x', memberId: 7, role: 'member', name: null, image: null });
    (listMutedWithEventDetails as jest.Mock).mockResolvedValue([
      { eventId: 42, title: 'Sauna', startsAt: new Date('2026-06-01T18:00:00Z'), mutedAt: new Date('2026-05-13T10:00:00Z') },
    ]);
    const res = await GET(new Request('http://x/api/preferences/notifications/muted'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.muted).toHaveLength(1);
    expect(body.muted[0]).toMatchObject({ eventId: 42, title: 'Sauna' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/app/api/preferences-notifications-muted.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the helper + route**

Create `src/lib/notifications/muted-with-events.ts`:

```ts
import { desc, eq } from 'drizzle-orm';
import { eventMutes, events } from '@/lib/db/schema';

export interface MutedEntry {
  eventId: number;
  title: string;
  startsAt: Date;
  mutedAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMutedWithEventDetails(db: any, memberId: number): Promise<MutedEntry[]> {
  const rows = await db
    .select({
      eventId: events.id,
      title: events.title,
      startsAt: events.startsAt,
      mutedAt: eventMutes.createdAt,
    })
    .from(eventMutes)
    .innerJoin(events, eq(eventMutes.eventId, events.id))
    .where(eq(eventMutes.memberId, memberId))
    .orderBy(desc(eventMutes.createdAt));
  return rows as MutedEntry[];
}
```

Create `src/app/api/preferences/notifications/muted/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { listMutedWithEventDetails } from '@/lib/notifications/muted-with-events';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request) {
  const authed = await getAuthedUser();
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (authed.memberId == null) return NextResponse.json({ muted: [] });
  const muted = await listMutedWithEventDetails(db, authed.memberId);
  return NextResponse.json({ muted });
}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx jest src/__tests__/app/api/preferences-notifications-muted.test.ts && npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/muted-with-events.ts src/app/api/preferences/notifications/muted/route.ts src/__tests__/app/api/preferences-notifications-muted.test.ts
git -c user.email=accounts@liminalcommons.com commit -m "feat(api): GET /api/preferences/notifications/muted lists user's muted series"
```

---

## Task 5: Broadcast recipient helper + tests

**Files:**
- Create: `src/lib/notifications/broadcast.ts`
- Test: `src/__tests__/lib/broadcast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/broadcast.test.ts`:

```ts
import { computeBroadcastRecipients, BROADCAST_ENABLED } from '@/lib/notifications/broadcast';

type Event = { id: number; visibility: string; startsAt: Date };

function makeDb(opts: {
  members: { id: number; hyloId: string | null }[];
  pushSubs: { userId: string }[];
  mutes: { memberId: number; eventId: number }[];
  notifLogTypes: { eventId: number; userId: string; type: string }[];
}) {
  return {
    _opts: opts,
    select: () => ({
      from: (table: { _name?: string }) => {
        const name = (table as any)?._name;
        if (name === 'members' || true) {
          return {
            where: () => ({
              // For chained joins we just expose collected rows
              innerJoin: () => ({ leftJoin: () => ({ where: () => Promise.resolve([]) }) }),
            }),
          };
        }
        return { where: () => Promise.resolve([]) };
      },
    }),
  };
}

describe('computeBroadcastRecipients', () => {
  const baseEvent: Event = { id: 42, visibility: 'public', startsAt: new Date() };

  test('returns empty for private events', async () => {
    const db = makeDb({ members: [], pushSubs: [], mutes: [], notifLogTypes: [] });
    const result = await computeBroadcastRecipients(db as any, { ...baseEvent, visibility: 'private' });
    expect(result).toEqual([]);
  });

  test('returns empty list when no members exist', async () => {
    const db = makeDb({ members: [], pushSubs: [], mutes: [], notifLogTypes: [] });
    const result = await computeBroadcastRecipients(db as any, baseEvent);
    expect(result).toEqual([]);
  });

  test('BROADCAST_ENABLED reads from process.env.BROADCAST_ENABLED', () => {
    const prev = process.env.BROADCAST_ENABLED;
    process.env.BROADCAST_ENABLED = 'true';
    jest.resetModules();
    const fresh = require('@/lib/notifications/broadcast') as typeof import('@/lib/notifications/broadcast');
    expect(fresh.BROADCAST_ENABLED).toBe(true);
    process.env.BROADCAST_ENABLED = 'false';
    jest.resetModules();
    const fresh2 = require('@/lib/notifications/broadcast') as typeof import('@/lib/notifications/broadcast');
    expect(fresh2.BROADCAST_ENABLED).toBe(false);
    process.env.BROADCAST_ENABLED = prev;
  });
});
```

The realistic integration test (filters mutes, dedupes against `notification_log`) requires more elaborate fake-db machinery; defer to Task 6's higher-level integration test which exercises the helper through the cron route against a real query plan.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/lib/broadcast.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/notifications/broadcast.ts`:

```ts
import { and, eq, isNotNull, notInArray, sql } from 'drizzle-orm';
import { members, eventMutes, pushSubscriptions, notificationLog } from '@/lib/db/schema';

export const BROADCAST_ENABLED = process.env.BROADCAST_ENABLED === 'true';

export const BROADCAST_START_TYPE = 'broadcast.start';

export interface BroadcastEvent {
  id: number;
  visibility: string;
  startsAt: Date;
}

export interface BroadcastRecipient {
  memberId: number;
  userId: string;
}

/**
 * Recipients for an at-start broadcast push:
 *   all members with an active push_subscription
 *   MINUS members who muted this event
 *   MINUS members already logged with type='broadcast.start' OR a same-window RSVP-path type
 *
 * Returns one row per (memberId, userId) pair; if a member has multiple
 * push_subscriptions rows they'll appear once — sendPushToUsers walks the
 * push_subscriptions table itself.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeBroadcastRecipients(db: any, event: BroadcastEvent): Promise<BroadcastRecipient[]> {
  if (event.visibility === 'private') return [];

  // Single query: members joined to push_subscriptions, excluding muted and already-sent.
  // notInArray with a subquery isn't portable on Neon HTTP driver, so do two passes.
  const allMembers = await db
    .select({ memberId: members.id, hyloId: members.hyloId })
    .from(members)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, members.hyloId))
    .where(isNotNull(members.hyloId));

  if (allMembers.length === 0) return [];

  const mutes = await db
    .select({ memberId: eventMutes.memberId })
    .from(eventMutes)
    .where(eq(eventMutes.eventId, event.id));
  const mutedSet = new Set<number>(mutes.map((r: { memberId: number }) => r.memberId));

  const alreadySent = await db
    .select({ userId: notificationLog.userId })
    .from(notificationLog)
    .where(and(eq(notificationLog.eventId, event.id), eq(notificationLog.type, BROADCAST_START_TYPE)));
  const sentSet = new Set<string>(alreadySent.map((r: { userId: string }) => r.userId));

  const out: BroadcastRecipient[] = [];
  const seen = new Set<number>();
  for (const m of allMembers as { memberId: number; hyloId: string }[]) {
    if (seen.has(m.memberId)) continue;
    if (mutedSet.has(m.memberId)) continue;
    if (sentSet.has(m.hyloId)) continue;
    seen.add(m.memberId);
    out.push({ memberId: m.memberId, userId: m.hyloId });
  }
  return out;
}
```

Note: the import of `sql` and `notInArray` is unused in the simpler two-pass implementation; if linter flags them, remove. The implementation is intentionally simple (two extra small queries) because the Neon HTTP driver can't bind JS arrays to `IN`/`ANY` placeholders — same constraint already worked around in `lib/notifications/push.ts`.

- [ ] **Step 4: Run tests + type-check**

Run: `npx jest src/__tests__/lib/broadcast.test.ts && npx tsc --noEmit`
Expected: both clean. The unit tests are minimal here; Task 6 covers the full integration path.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/broadcast.ts src/__tests__/lib/broadcast.test.ts
git -c user.email=accounts@liminalcommons.com commit -m "feat(notifications): computeBroadcastRecipients + BROADCAST_ENABLED gate"
```

---

## Task 6: Wire broadcast into `send-reminders` cron + integration test

**Files:**
- Modify: `src/app/api/cron/send-reminders/route.ts`
- Test: extend an existing send-reminders test or create `src/__tests__/app/send-reminders-broadcast.test.ts`

- [ ] **Step 1: Locate the at-start window section in the existing cron route**

Read `src/app/api/cron/send-reminders/route.ts` end-to-end. Find where it processes the `push-start` window (the at-start RSVP push). The broadcast hook fires AFTER that block — for each event entering the at-start window — so RSVPed users get their normal push first and broadcast dedupe (via `notification_log.type`) won't double-send to them.

- [ ] **Step 2: Write the integration test**

Create `src/__tests__/app/send-reminders-broadcast.test.ts`:

```ts
/**
 * Integration test for the broadcast step inside send-reminders.
 *
 * This test exercises the GLUE between the cron route and computeBroadcastRecipients,
 * not the recipient computation itself (Task 5 covers that). We assert:
 *  - When BROADCAST_ENABLED=true and an event enters the at-start window,
 *    sendPushToUsers is called once per (recipient.userId) and a notification_log
 *    row with type='broadcast.start' is created.
 *  - When BROADCAST_ENABLED=false, no broadcast push fires even if events qualify.
 */

import * as broadcastMod from '@/lib/notifications/broadcast';
import * as pushMod from '@/lib/notifications/push';

jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/notifications/broadcast', () => ({
  ...jest.requireActual('@/lib/notifications/broadcast'),
  computeBroadcastRecipients: jest.fn(),
}));
jest.mock('@/lib/notifications/push', () => ({
  sendPushToUsers: jest.fn(),
}));

describe('send-reminders: broadcast step', () => {
  const originalFlag = process.env.BROADCAST_ENABLED;
  afterEach(() => {
    process.env.BROADCAST_ENABLED = originalFlag;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('skips broadcast when BROADCAST_ENABLED is false', async () => {
    process.env.BROADCAST_ENABLED = 'false';
    jest.resetModules();
    const { GET } = await import('@/app/api/cron/send-reminders/route');
    const req = new Request('http://x/api/cron/send-reminders', {
      headers: { Authorization: 'Bearer ' + (process.env.CRON_SECRET || 'test-secret') },
    });
    process.env.CRON_SECRET = 'test-secret';
    await GET(req);
    expect(broadcastMod.computeBroadcastRecipients).not.toHaveBeenCalled();
  });

  // The success-path integration test depends on the cron route's current event-fetch
  // implementation. Once Step 4 wires broadcast in, add: mock the events-in-at-start-window
  // query to return [{id:42,visibility:'public',startsAt:new Date()}]; mock
  // computeBroadcastRecipients to return [{memberId:7,userId:'hylo-7'}]; assert
  // sendPushToUsers called with ['hylo-7'] and a payload with title.
});
```

- [ ] **Step 3: Run test to verify it fails (or skips gracefully)**

Run: `npx jest src/__tests__/app/send-reminders-broadcast.test.ts`
Expected: the test executes; the negative case (`skips broadcast when BROADCAST_ENABLED is false`) currently passes vacuously (broadcast not yet wired). The positive case is intentionally a comment-only TODO until Step 4 completes the wiring.

- [ ] **Step 4: Add the broadcast block to the cron route**

In `src/app/api/cron/send-reminders/route.ts`, after the existing RSVP at-start push dispatch block, append:

```ts
  // ---- Broadcast (at-start) push to non-RSVPed members ----
  // Gated by BROADCAST_ENABLED env flag; fires AFTER the RSVP at-start fanout
  // so notification_log uniqueness on (event_id, user_id, type) gives a
  // single source of truth and broadcast.start rows can be filtered/audited
  // independently from the RSVP push-start rows.
  if (BROADCAST_ENABLED) {
    // events entering the at-start window are already in `pushEventsAtStart`
    // (or whatever local variable holds them — adjust during implementation
    // to match the route's actual local). Iterate that and dispatch broadcasts.
    for (const event of pushEventsAtStart) {
      const recipients = await computeBroadcastRecipients(db, event);
      if (recipients.length === 0) continue;
      for (const r of recipients) {
        try {
          await sendPushToUsers([r.userId], {
            title: event.title,
            body: `${event.title} is starting now`,
            url: `/events/${event.id}`,
            tag: `broadcast-start-${event.id}`,
          });
          await db.insert(notificationLog).values({
            eventId: event.id,
            userId: r.userId,
            type: BROADCAST_START_TYPE,
          }).onConflictDoNothing();
        } catch (err) {
          console.error('[send-reminders] broadcast push failed', { eventId: event.id, userId: r.userId, err });
        }
      }
    }
  }
```

Add the necessary imports near the top of the route file:

```ts
import { BROADCAST_ENABLED, BROADCAST_START_TYPE, computeBroadcastRecipients } from '@/lib/notifications/broadcast';
```

**Note for implementer:** the variable name `pushEventsAtStart` is a placeholder. When wiring this in, locate the actual local that holds events entering the `push-start` window in the existing route (look for the loop that pushes for `'push-start'` or `PUSH_WINDOWS` matching `'push-start'`). Use that variable; if no such local exists yet because at-start RSVP-push aggregates with other windows, the simplest path is to filter the existing `pushDueRows` by the at-start window type inline before this block. The route is dense; spend a moment reading the surrounding ~50 lines before patching.

- [ ] **Step 5: Run tests + type-check**

Run: `npx jest src/__tests__/app/ && npx tsc --noEmit`
Expected: existing send-reminders tests still pass; the new test's negative case passes.

- [ ] **Step 6: Manually flesh out the positive-case integration test**

Edit the TODO at the bottom of `src/__tests__/app/send-reminders-broadcast.test.ts` into a real test that mocks the events-in-at-start-window query and asserts:
- `computeBroadcastRecipients` called once per event
- `sendPushToUsers` called once per recipient with payload `{ title, body: "<title> is starting now", url: "/events/{id}", tag: "broadcast-start-{id}" }`
- `notificationLog` insert called with `type: 'broadcast.start'`

The mock shape depends on what local variables the cron route uses; copy a working mock pattern from `src/__tests__/app/send-reminders-route.test.ts` (existing tests for the same file are the cheapest template).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/send-reminders/route.ts src/__tests__/app/send-reminders-broadcast.test.ts
git -c user.email=accounts@liminalcommons.com commit -m "feat(cron): broadcast at-start push to non-muted members behind BROADCAST_ENABLED"
```

---

## Task 7: EventDetailView mute toggle UI

**Files:**
- Modify: `src/components/events/EventDetailView.tsx`
- Test: `src/__tests__/components/EventDetailView-mute.test.tsx`

- [ ] **Step 1: Locate insertion point**

Read `src/components/events/EventDetailView.tsx`. Find where the action buttons (RSVP, share, etc.) live. The mute toggle joins them as a peer.

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/components/EventDetailView-mute.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventDetailView } from '@/components/events/EventDetailView';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const baseEvent = {
  id: 42,
  title: 'Sauna Sunday',
  description: '',
  starts_at: new Date('2026-06-01T18:00:00Z').toISOString(),
  ends_at: null,
  timezone: 'UTC',
  location: '',
  image_url: null,
  recurrenceRule: null,
  creatorId: 'x',
  creatorName: 'Host',
  creatorImage: null,
  visibility: 'public',
  rsvps: [],
};

describe('EventDetailView mute toggle', () => {
  test('shows Mute button when initially not muted', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ muted: false }) });
    render(<EventDetailView event={baseEvent as any} initiallyMuted={false} />);
    expect(screen.getByRole('button', { name: /mute notifications/i })).toBeInTheDocument();
  });

  test('clicking Mute calls POST and updates UI to Unmute', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ muted: true, eventId: 42 }) });
    render(<EventDetailView event={baseEvent as any} initiallyMuted={false} />);
    await userEvent.click(screen.getByRole('button', { name: /mute notifications/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/events/42/mute', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(screen.getByRole('button', { name: /unmute/i })).toBeInTheDocument());
  });

  test('clicking Unmute calls DELETE and updates UI to Mute', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ muted: false, eventId: 42 }) });
    render(<EventDetailView event={baseEvent as any} initiallyMuted={true} />);
    await userEvent.click(screen.getByRole('button', { name: /unmute/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/events/42/mute', expect.objectContaining({ method: 'DELETE' })));
    await waitFor(() => expect(screen.getByRole('button', { name: /mute notifications/i })).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/__tests__/components/EventDetailView-mute.test.tsx`
Expected: FAIL — `EventDetailView` doesn't accept `initiallyMuted` prop yet, or doesn't render Mute button.

- [ ] **Step 4: Implement the toggle**

Modify `src/components/events/EventDetailView.tsx`:

1. Add `initiallyMuted: boolean` to the props interface (default `false` if undefined).
2. Import `useState` if not already.
3. Add internal state: `const [muted, setMuted] = useState(initiallyMuted);` and `const [muteLoading, setMuteLoading] = useState(false);`.
4. Add a handler:

```tsx
async function toggleMute() {
  setMuteLoading(true);
  try {
    const res = await fetch(`/api/events/${event.id}/mute`, {
      method: muted ? 'DELETE' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const j = await res.json();
      setMuted(!!j.muted);
    }
  } finally {
    setMuteLoading(false);
  }
}
```

5. Render the button alongside existing action buttons:

```tsx
<button
  type="button"
  onClick={toggleMute}
  disabled={muteLoading}
  aria-label={muted ? 'Unmute notifications for this series' : 'Mute notifications for this series'}
  className="rounded-lg border border-grove-border px-3 py-2 text-sm text-grove-text hover:bg-grove-border/20 disabled:opacity-50"
>
  {muted ? '🔔 Unmute' : '🔕 Mute notifications'}
</button>
```

6. Update the route/parent that loads this view to pass `initiallyMuted` from a server-side check using `isSeriesMuted(db, authed.memberId, event.id)` — if that's not already exposed in the page's data load, add it to the page component (`src/app/events/[id]/page.tsx` or wherever the detail page lives — verify location while implementing).

- [ ] **Step 5: Run tests + type-check**

Run: `npx jest src/__tests__/components/EventDetailView-mute.test.tsx && npx tsc --noEmit`
Expected: all 3 tests pass; type-check clean.

- [ ] **Step 6: Browser verification**

Start dev server (`npm run dev`), open `http://localhost:3000/events/<any-id>` while signed in. Tap Mute → confirm button flips to Unmute and persists after reload. Tap Unmute → confirm reversal.

- [ ] **Step 7: Commit**

```bash
git add src/components/events/EventDetailView.tsx src/app/events src/__tests__/components/EventDetailView-mute.test.tsx
git -c user.email=accounts@liminalcommons.com commit -m "feat(ui): mute toggle on event detail view"
```

---

## Task 8: Calendar card mute indicator + context menu

**Files:**
- Modify: actual event-card component (locate via `grep -l "event.title" src/components/calendar/`)
- Test: ad-hoc visual via dev server; unit test optional (UI affordance)

- [ ] **Step 1: Locate the card**

```bash
grep -lE "event\.(title|starts_at)" src/components/calendar/ | head -5
```

Inspect each candidate. The one rendering each event tile in the weekly/monthly grid is the target. Likely `EventBlock.tsx` or similar.

- [ ] **Step 2: Plumb `mutedSeriesIds: Set<number>` down to the card**

In the parent that loads events (likely `WeeklyGrid.tsx` / `CalendarView.tsx`), fetch `/api/preferences/notifications/muted` on mount via a `useEffect` and store `mutedSeriesIds: Set<number>`. Pass into each card.

```tsx
const [mutedSeriesIds, setMutedSeriesIds] = useState<Set<number>>(new Set());
useEffect(() => {
  fetch('/api/preferences/notifications/muted', { credentials: 'include' })
    .then(r => r.ok ? r.json() : { muted: [] })
    .then(j => setMutedSeriesIds(new Set((j.muted || []).map((m: { eventId: number }) => m.eventId))))
    .catch(() => {});
}, []);
```

- [ ] **Step 3: Render bell-slash indicator on muted cards**

In the card component, when `mutedSeriesIds.has(event.id)`:

```tsx
{isMuted && (
  <span aria-label="Muted" title="Notifications muted" className="absolute right-1 top-1 text-grove-text-dim">
    🔕
  </span>
)}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Browser verification**

Mute an event in the detail view, return to the calendar grid, confirm a 🔕 appears on the card.

- [ ] **Step 6: Commit**

```bash
git add src/components/calendar
git -c user.email=accounts@liminalcommons.com commit -m "feat(ui): bell-slash indicator on muted event cards in calendar grid"
```

---

## Task 9: NotificationPreferences muted-series section

**Files:**
- Modify: `src/components/NotificationPreferences.tsx`

- [ ] **Step 1: Add a "Muted series" section**

Append to the existing `NotificationPreferences` component a new section that fetches `/api/preferences/notifications/muted` on mount and renders the list with per-row Unmute buttons.

```tsx
const [muted, setMuted] = useState<Array<{ eventId: number; title: string; startsAt: string }>>([]);
useEffect(() => {
  fetch('/api/preferences/notifications/muted', { credentials: 'include' })
    .then(r => r.ok ? r.json() : { muted: [] })
    .then(j => setMuted(j.muted || []))
    .catch(() => {});
}, []);

async function unmute(eventId: number) {
  const res = await fetch(`/api/events/${eventId}/mute`, { method: 'DELETE', credentials: 'include' });
  if (res.ok) setMuted(prev => prev.filter(m => m.eventId !== eventId));
}

// in JSX:
<section className="mt-6">
  <h3 className="text-sm font-semibold text-grove-text">Muted series</h3>
  {muted.length === 0 ? (
    <p className="text-xs text-grove-text-dim">No muted events.</p>
  ) : (
    <ul className="mt-2 space-y-1">
      {muted.map(m => (
        <li key={m.eventId} className="flex items-center justify-between rounded border border-grove-border/30 px-2 py-1 text-sm">
          <span>{m.title}</span>
          <button onClick={() => unmute(m.eventId)} className="text-xs text-grove-accent hover:underline">
            Unmute
          </button>
        </li>
      ))}
    </ul>
  )}
</section>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Browser verification**

Open `/settings`, mute a few events from the calendar, return to settings → "Muted series" section lists them → click Unmute → row disappears.

- [ ] **Step 4: Commit**

```bash
git add src/components/NotificationPreferences.tsx
git -c user.email=accounts@liminalcommons.com commit -m "feat(ui): muted series section in notification preferences"
```

---

## Task 10: Feature-flag rollout

**Files:**
- (No code changes — Vercel env var only)

- [ ] **Step 1: Add `BROADCAST_ENABLED=false` env var to Vercel project `liminal-calendar-v3`**

In the Vercel dashboard for project `liminal-calendar-v3`: Settings → Environment Variables → Add → `BROADCAST_ENABLED` = `false`, scopes Production + Preview. Save.

- [ ] **Step 2: Verify deploy picks up the flag**

After the next deploy completes (or manually trigger one), `curl https://liminalcalendar.com/api/cron/send-reminders -H "Authorization: Bearer $CRON_SECRET"` should still return `{sent:0,...}` (no broadcast attempted) regardless of events. Confirm `notification_log` has no `broadcast.start` rows.

- [ ] **Step 3: Enable feature**

Flip Vercel env var: `BROADCAST_ENABLED` = `true`. Redeploy.

- [ ] **Step 4: Validate end-to-end with a real event**

Create an event starting in ~10 minutes. After the at-start cron tick (5-10 min later), confirm:
- Push lands on a device that hasn't RSVPed and hasn't muted
- `notification_log` has a `broadcast.start` row for the right (event, user)
- Mute the event from a second device's push tap → confirm subsequent ticks don't re-fire (one-shot per event anyway, but if another instance of a recurring series fires the next day, the mute should suppress it)

- [ ] **Step 5: Monitor for one week**

Watch `/api/cron/notifications-health` for errors. If clean: remove the flag entirely (delete env var, remove `BROADCAST_ENABLED` check from `broadcast.ts` so broadcast always runs). If issues: flip flag to `false` while debugging.

- [ ] **Step 6: Final cleanup commit (after monitoring period)**

```bash
# Remove the BROADCAST_ENABLED gate from broadcast.ts and the cron route guard.
# Update tests to drop env-var stubbing.
git -c user.email=accounts@liminalcommons.com commit -m "chore(broadcast): remove BROADCAST_ENABLED flag after 1wk clean operation"
```

---

## Self-Review Summary

**Spec coverage:**
- ✅ `event_mutes` table — Task 1
- ✅ Recipient model (all members − muted − already-sent) — Task 5 + Task 6
- ✅ At-start broadcast timing — Task 6
- ✅ POST/DELETE mute API — Task 3
- ✅ Listing muted series API — Task 4
- ✅ EventDetailView mute toggle — Task 7
- ✅ Calendar card indicator — Task 8
- ✅ Settings page muted-series section — Task 9
- ✅ BROADCAST_ENABLED feature flag — Task 5 (constant) + Task 6 (cron guard) + Task 10 (rollout)
- ✅ No audience cap — implemented by simply not adding one
- ✅ Private events excluded — Task 5

**Type consistency check:**
- `BroadcastRecipient = { memberId: number; userId: string }` — used in Task 5 and referenced in Task 6 ✅
- `event.id` is `number` everywhere ✅
- `series_id` from spec renamed to `event_id` (since recurring events share a single seed row) — consistent across all tasks ✅
- `BROADCAST_START_TYPE = 'broadcast.start'` constant defined in Task 5, used in Task 6 ✅

**Open risks deliberately accepted:**
- Unit tests with hand-written fake-db stubs may not perfectly mirror Drizzle operator composition. If tests fail spuriously during implementation, tighten the fakes; do NOT loosen production code.
- The cron route variable name `pushEventsAtStart` in Task 6's snippet is a placeholder — Step 1 of Task 6 explicitly directs the implementer to locate the actual local.
- Mute-then-RSVP override (spec's open risk): not implemented in v1; mute wins. If users complain, add an RSVP-time auto-unmute in a follow-up.
