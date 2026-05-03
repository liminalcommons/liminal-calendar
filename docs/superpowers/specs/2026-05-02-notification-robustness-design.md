# Notification Robustness + Global Preferences — Design

**Date:** 2026-05-02
**Status:** Approved (brainstorming) → ready for writing-plans
**Slice:** Single coherent ship covering robustness fixes, preference-model overhaul, and three event-detail cleanups.

---

## 1. Context

Audit of the current notification stack found:

- Service worker (`public/sw.js`), VAPID push backend (`lib/notifications/push.ts`), PWA manifest, server cron (`/api/cron/send-reminders`), and dedupe via `notification_log` are all already in place.
- `NotificationScheduler.tsx` is a client-side 60-second poll that fires at the 15-min mark *only when the tab is open*. It overlaps with the server cron's `push-15min` window and represents wrong-tier reliability.
- `InstallPrompt.tsx` only listens for `beforeinstallprompt`, which iOS Safari never fires — iPhone users in Safari never see install guidance, so they never reach a state where push notifications are even possible.
- The cron schedule lives on a chora-node crontab, not in `vercel.json`. A `/api/cron/heartbeat` endpoint exists but no monitor is currently wired to alert on staleness.
- Users who dismiss the onboarding prompt have no path to re-enable notifications later — there is no settings UI.
- Notification opt-in is per-RSVP via `rsvps.remindMe`, which is the wrong granularity. Users should choose channels and horizons globally, not per-event.
- The event detail view shows a "Subscribe to monthly newsletter" signup that doesn't belong on every event card.

## 2. Goals

1. **Make notifications properly fire on mobile and desktop** — fix the iOS install path; delete the wrong-tier client poller; wire heartbeat monitoring.
2. **Move opt-in from per-RSVP to per-user** with a granular channels × horizons checklist, exposed in both onboarding and a new settings panel.
3. **Clean up the event detail view** — remove the per-RSVP `remindMe` toggle and the newsletter signup; add inline "Recurring — applies to all occurrences" text where applicable.
4. **Add a per-user filtered ICS feed option** (`?filter=rsvps-only`) so subscribers can pull only their RSVPed events.

## 3. Non-goals (deferred follow-ups)

- **Per-instance RSVP opt-out for recurring events** (option B from brainstorming). Requires `rsvps.skipInstanceDates JSON` column, recurrence-expander integration, and reminder-cron skip-list awareness. Its own slice.
- **"My RSVPs" filter toggle on the calendar view itself.** Calendar-view feature, not a notification feature. Its own slice.
- **Per-channel granularity beyond push/email** (SMS, OS-level on Android, etc.).
- **User-tunable horizons beyond the 6 provided defaults** (e.g., "remind me 3 days before"). Preference bloat; revisit on real demand.
- **Backfill migration of existing `rsvps.remindMe = false` users.** Behavior change is acceptable per §10.

## 4. Architecture

The core shift: **notification opt-in moves from per-RSVP to per-user.** Today the cron joins `events ⨝ rsvps` filtered by `rsvps.remindMe = true`. After this slice, the cron joins `events ⨝ rsvps ⨝ notification_preferences` filtered by the user's per-channel + per-horizon preferences. RSVP itself becomes the "I want to be notified about this event" signal; the granularity (which channels, which horizons) is one global setting per user.

Three architectural layers:

1. **Preference data model** — new `notification_preferences` table keyed on `userId`, with 6 boolean columns. One row per user, lazily inserted on first preference access via `INSERT … ON CONFLICT DO NOTHING`.
2. **Cron read path** — `/api/cron/send-reminders` switches its filter from `rsvps.remindMe = true` to a join on `notification_preferences.{channel}_{horizon} = true`. Each of the 6 windows checks its corresponding column. `notification_log` dedupe stays as-is.
3. **UI surfaces** — a single `<NotificationPreferences>` React component renders in two places: (a) `SubscribePrompt`'s notifications step, (b) a new `/settings/notifications` route reachable from `NavGearMenu`. Same component, same load/save, same look.

## 5. Data model

### 5.1 New table: `notification_preferences`

```sql
CREATE TABLE notification_preferences (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE,         -- Hylo user id OR Clerk user id (matches rsvps.user_id pattern)
  push_1h       BOOLEAN NOT NULL DEFAULT TRUE,
  push_15min    BOOLEAN NOT NULL DEFAULT TRUE,
  push_at_start BOOLEAN NOT NULL DEFAULT TRUE,
  email_24h     BOOLEAN NOT NULL DEFAULT FALSE,
  email_1h      BOOLEAN NOT NULL DEFAULT FALSE,
  email_15min   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Defaults rationale:** push ON because the audit established push is the primary channel and email is "not essential." Users who want email opt in explicitly. New users get sensible defaults without any onboarding interaction needed — if they skip the prompt, they still get push reminders.

**Lazy-insert pattern:** `ensurePreferences(userId)` does `INSERT … ON CONFLICT DO NOTHING` then returns the row. Called from `GET /api/preferences/notifications` and from the cron read path. No backfill migration needed — every existing user lazily gets defaults the first time they (or the cron) touch their record.

### 5.2 `rsvps.remindMe` fate

Kept in schema (no destructive migration), defaulted TRUE on new writes, ignored by the cron read path. Becomes a per-RSVP override hook when follow-up B (per-instance opt-out) lands. A one-line comment in `schema.ts` explains why it's vestigial.

### 5.3 Window-to-column mapping

Single source of truth for cron + UI + tests:

```ts
// src/lib/notifications/preferences.ts
export const WINDOW_TO_COLUMN = {
  'push-1hr':    'push_1h',
  'push-15min':  'push_15min',
  'push-start':  'push_at_start',
  '24hr':        'email_24h',
  '1hr':         'email_1h',
  '15min':       'email_15min',
} as const;
```

The cron's `EMAIL_WINDOWS` and `PUSH_WINDOWS` arrays already key on these strings, so no change there — only the JOIN/WHERE references the column derived from this map.

## 6. Cron read-path swap

`/api/cron/send-reminders` route changes:

**Before:**
```ts
.innerJoin(rsvps, and(
  eq(rsvps.eventId, events.id),
  eq(rsvps.remindMe, true),         // ← removed
  not(eq(rsvps.status, 'no'))
))
```

**After:**
```ts
.innerJoin(rsvps, and(
  eq(rsvps.eventId, events.id),
  not(eq(rsvps.status, 'no'))
))
.innerJoin(notificationPreferences, eq(notificationPreferences.userId, rsvps.userId))
.where(and(
  gte(events.startsAt, windowStart),
  lte(events.startsAt, windowEnd),
  eq(notificationPreferences[WINDOW_TO_COLUMN[windowType]], true)
))
```

Helpers in `src/lib/notifications/reminder-dispatch.ts` likely need a touch to thread the per-window column through.

## 7. UI surfaces

### 7.1 `<NotificationPreferences>` (new shared component)

Six-checkbox grid, two columns:

```
Push notifications              Email notifications
☑ 1 hour before                 ☐ 24 hours before
☑ 15 minutes before             ☐ 1 hour before
☑ When the event starts         ☐ 15 minutes before
```

State loaded from `GET /api/preferences/notifications` on mount. Each toggle fires `PUT /api/preferences/notifications` with the full prefs object (simple, no patch semantics needed). Loading + error states rendered inline.

### 7.2 `SubscribePrompt` notifications step (modified)

- iOS guard: when `iOS && !standalone`, swap "Enable notifications" button for "Install app first" with Share→AddToHomeScreen instructions and a small icon. Don't call `Notification.requestPermission()` (it would silently fail anyway).
- Otherwise: render `<NotificationPreferences>` inline + an "Enable" button that calls `Notification.requestPermission()`, subscribes to push if granted, and saves the current checkbox state to `notification_preferences`.

### 7.3 New settings route

- Path: `/settings/notifications`
- Mounted in `NavGearMenu` as a "Notifications" item.
- Renders `<NotificationPreferences>` + an "Events you'll be notified about" preview list (next 5 upcoming RSVPs where `status != 'no'`, sorted by `startsAt`).
- "Disable all" affordance: when all 6 checkboxes are off, also DELETE the user's `push_subscriptions` rows so the browser's permission state is the only remaining signal.

### 7.4 `InstallPrompt.tsx` iOS branch

Detection: `'standalone' in navigator && !navigator.standalone && /iPad|iPhone|iPod/.test(navigator.userAgent)`. If true and `beforeinstallprompt` hasn't fired (it won't on iOS), render an iOS-specific card with the same dismiss state-machine (7-day localStorage key) but different content:

```
📱 Add to Home Screen for the full experience

1. Tap the Share button (□↑) at the bottom of Safari
2. Scroll down and tap "Add to Home Screen"
3. Tap "Add" in the top-right
```

### 7.5 Event detail view cleanups

In `src/components/events/EventRSVP.tsx` (verified: this is the single file containing both the `remindMe` toggle at line 264 and the "Subscribe to the monthly newsletter" affordance at line 280):

- **Remove** the per-RSVP "Remind me" toggle and its `useState`/effect plumbing (lines 82, 100, 124, 137-156, 264).
- **Remove** the "Subscribe to monthly newsletter" section (line 280 region).
- **Add** inline text "Recurring — applies to all occurrences" near the RSVP buttons when `event.recurrenceRule` is non-null.
- The `RsvpInput` type (`remindMe?: boolean` at line 17) keeps the field optional and writes `remindMe: true` on the API call, so the schema column continues to default TRUE for any new RSVPs.

## 8. ICS feed filter

`/api/calendar/feed.ics?token=…&filter=rsvps-only`

- New optional query param. Backwards compatible: omitting it preserves today's behavior (all events).
- When present and equals `rsvps-only`: query `events` joined to `rsvps` filtered to the token's `user_id` and `status != 'no'`. Same ICS rendering pipeline.
- Documented in the user-facing settings panel: a third feed-URL link "Only my RSVPs."

## 9. Heartbeat operations

### 9.1 Backup Vercel cron

New route `/api/cron/heartbeat-check` (Bearer-auth same `CRON_SECRET`):

- Reads `notification_log.sent_at` MAX.
- If older than 30 minutes (matches the existing heartbeat threshold), sends an email to `process.env.NOTIFICATION_ADMIN_EMAIL` via the existing `sendEmail()` helper.
- Returns `{ status: 'ok'|'stale', notified: boolean, lastSentAt }`.

`vercel.json` adds:

```json
{ "path": "/api/cron/heartbeat-check", "schedule": "0 12 * * *" }
```

Vercel Hobby allows daily; daily is enough as a backup safety net. Primary monitor remains UptimeRobot at /api/cron/heartbeat (15-min granularity).

### 9.2 Documented operator playbook

Update `docs/notifications/scheduling.md`:

- **Primary:** UptimeRobot keyword check at `/api/cron/heartbeat`, alert on `"status":"stale"`, every 15 min. Owner sets this up manually post-deploy.
- **Backup:** `/api/cron/heartbeat-check` Vercel daily cron, emails admin on stale. Catches case where chora-node is down AND UptimeRobot is unconfigured/down.
- **Smoke:** query `notification_log` for rows in the last hour; zero rows = trigger is down.

## 10. Cleanups (deletions)

| File / surface | Action | Reason |
|---|---|---|
| `src/components/NotificationScheduler.tsx` | Delete entire file | Wrong-tier reliability layer; client poll only fires when tab is open and overlaps with cron `push-15min`. |
| `<NotificationScheduler />` mount in `src/app/layout.tsx` | Remove | Component deleted. |
| `remindMe` checkbox in event detail view | Remove from UI | Notifications are now global preference, not per-RSVP. Column kept in schema as override hook for future B. |
| Newsletter signup in event detail view | Remove from UI | Doesn't belong on every event card; lives in a dedicated newsletter signup surface (not in this slice — separate concern). |

**Existing-data behavior change:** users with `rsvps.remindMe = false` today (who actively opted out per-event) will start receiving push at the global default (TRUE) after this ships. Acceptable because:
- Defaults match the new "RSVP = notify" model.
- Settings → Notifications gives them a clean global off-switch.
- The RSVP form defaults `remindMe = true` today, so the population of `remindMe = false` users is minimal.

## 11. Testing strategy

### 11.1 Automated tests (Jest + RTL) — TDD per IRON LAW

| Layer | Test type | What it asserts |
|-------|-----------|-----------------|
| `lib/notifications/preferences.ts` | Jest unit | `ensurePreferences` is idempotent; `getPreferences` returns defaults for new user; `updatePreferences` persists all 6 columns. |
| `/api/preferences/notifications` (route) | Jest route | GET returns defaults lazily; PUT validates all 6 booleans; auth required (401 without session). |
| `send-reminders` cron | Jest route | Joins respect new per-window column; users with all push columns OFF get no push; user with `email_1h` ON + `email_24h` OFF gets email at 1h horizon only. |
| `<NotificationPreferences>` | RTL component | Renders 6 checkboxes; toggling fires PUT; loading + error states render. |
| `InstallPrompt` iOS branch | RTL + UA mock | iOS Safari + not-standalone → shows iOS card; Chrome desktop → uses native flow. |
| `feed.ics?filter=rsvps-only` | Route test | Returns only RSVPed events for the token's user; without filter, returns all events (backwards compat). |
| `heartbeat-check` cron | Route test | Returns 200 + sends email when stale; returns 200 + no email when fresh. |

**Existing tests to update (not break):**
- `events-route-revalidate.test.ts` — RSVP write path no longer affects `remindMe` semantics meaningfully.
- Any test asserting newsletter-signup or `remindMe`-toggle render in event detail view: delete with the UI.

### 11.2 Chrome MCP E2E verification

Baked into the loop's done-condition: each positiva cycle must pass this script before being marked complete. Negativa cycles run this script to find regressions.

| Test | Chrome MCP API | Verifies |
|------|---|---|
| Service worker registers + activates | `javascript_tool` reading `navigator.serviceWorker.ready` | Section 4 layer 3 |
| Manifest loads with right fields | `navigate` to `/manifest.json` + `read_page` | Existing manifest valid |
| SubscribePrompt appears after sign-in | `navigate` + `find` element after delay | §7.2 |
| 6 checkboxes render with right defaults | `read_page` + `find` 6 inputs | §7.1 |
| Toggle preferences → API PUT fires → DB row updates | `form_input` + `read_network_requests` | §7.1 + §6 |
| `/settings/notifications` route loads | `navigate` + `find` heading | §7.3 |
| Event detail view: no `remindMe` toggle, no newsletter signup | `read_page` + assert text absent | §10 |
| Recurring event shows inline text | `read_page` + assert text present | §7.5 |
| `feed.ics?filter=rsvps-only` returns filtered XML | `navigate` + `read_page` | §8 |
| `/api/cron/heartbeat` returns expected JSON | `navigate` + `read_page` | §9.2 |
| No console errors during full flow | `read_console_messages` with pattern filter | Cross-cutting |

**Cannot be Chrome-MCP-automated** (require manual or different harness):
- Real OS-level push notification delivery on a device.
- iPhone Safari real install-to-home-screen flow.
- 1-hour wait for real cron tick (use direct cron route call with seeded near-future event instead).

## 12. File changes summary

### New files (9)

- `src/lib/db/schema.ts` (modified — but adds `notificationPreferences` table)
- `src/lib/db/migrations/NNNN_notification_preferences.sql`
- `src/lib/notifications/preferences.ts`
- `src/components/NotificationPreferences.tsx`
- `src/app/settings/notifications/page.tsx`
- `src/app/api/preferences/notifications/route.ts`
- `src/app/api/cron/heartbeat-check/route.ts`
- `src/__tests__/lib/notifications/preferences.test.ts`
- `src/__tests__/components/NotificationPreferences.test.tsx`
- `src/__tests__/app/api/cron/send-reminders-prefs.test.ts`

### Modified files (8)

- `src/components/InstallPrompt.tsx` (iOS branch)
- `src/components/SubscribePrompt.tsx` (NotificationPreferences + iOS guard)
- `src/app/api/cron/send-reminders/route.ts` (read-path swap)
- `src/components/NavGearMenu.tsx` (Notifications item)
- `src/components/events/EventRSVP.tsx` (remove remindMe toggle + newsletter section; add recurring inline text)
- `src/app/api/calendar/feed.ics/route.ts` (filter param)
- `src/app/layout.tsx` (remove NotificationScheduler mount)
- `vercel.json` (heartbeat-check cron)
- `docs/notifications/scheduling.md` (operator playbook)

### Deletions (1)

- `src/components/NotificationScheduler.tsx`

## 13. Acceptance contract

- [ ] All new + modified files pass `npx tsc --noEmit` in `packages/liminal-calendar`.
- [ ] All new Jest tests pass; no existing Jest tests broken.
- [ ] Chrome MCP E2E script (§11.2) walks the full flow without errors and without console errors.
- [ ] Manual smoke checklist (in commit message or PR description) ticked: real iPhone Safari install → standalone → notification permission grant → push received from a near-future seeded event.
- [ ] `NotificationScheduler.tsx` deleted; `grep -r NotificationScheduler` returns 0 hits.
- [ ] Event detail view: no `remindMe` toggle, no newsletter signup, recurring events show inline text.
- [ ] `notification_preferences` table exists with correct defaults; existing users lazily get rows on first preference touch.
- [ ] `vercel.json` includes both `materialize` (existing) and `heartbeat-check` (new) cron entries.
- [ ] `docs/notifications/scheduling.md` updated with operator playbook (§9.2).

## 14. Risks

1. **Behavior change for `remindMe = false` users.** Mitigation: settings panel gives clean global off; population is small; defaults match new model.
2. **Column-name → window mapping drift.** Mitigation: single `WINDOW_TO_COLUMN` config object referenced by cron, UI, and tests.
3. **Lazy insert race.** Mitigation: `ON CONFLICT DO NOTHING` makes concurrent first-touches safe; second one no-ops.
4. **iOS install detection false positive.** Mitigation: feature-detect `'standalone' in navigator` (iOS-only API) AND `display-mode: standalone` MQ; only show iOS card when both checks confirm not-installed iOS.
5. **Heartbeat-check cron leaks the admin email in a log.** Mitigation: read from `process.env.NOTIFICATION_ADMIN_EMAIL`; document in `.env.example`; no hardcode.
6. **Vercel daily cron fires at fixed UTC time** — if the chora-node cron fails right after Vercel's daily check, up to 24h pass before the backup catches it. Mitigation: UptimeRobot remains the primary 15-min-granularity monitor; backup is for the case where UptimeRobot is also misconfigured.

## 15. Out of scope (explicit)

- Per-instance RSVP opt-out for recurring events (deferred follow-up B).
- "My RSVPs" filter toggle on calendar UI (separate slice).
- SMS notifications.
- User-tunable horizons beyond the 6 provided defaults.
- Backfill migration of existing `rsvps.remindMe = false` users.
- Newsletter signup relocation (this slice only removes from event detail view; where it lives long-term is a separate decision).
