# Broadcast-with-Mute — Design

**Date:** 2026-05-13
**Status:** Approved — pending implementation plan

## Problem

People attend Liminal Calendar events without RSVPing, then miss them when they're not on the radar. Current notification model only reaches members who explicitly RSVP, so RSVP-friction becomes a discovery cliff. Goal: notify every member when an event starts, with low-friction opt-out per series.

## Goal

Broadcast a single push notification at event start time to every community member who has not muted the series, in addition to the existing RSVP-based reminder pipeline. Provide in-app mute toggles on event surfaces (detail page, calendar card) so irrelevant series can be silenced in one tap.

## Non-Goals

- Native notification action buttons (deferred — cross-platform identical in-app toggles instead)
- Per-host mute, per-tag mute, per-category subscriptions (later if needed)
- Pre-event broadcasts (24hr / 1hr / 15min for non-RSVPed) — only at-start
- Email broadcast (push only for now)
- Changing existing RSVP-based reminder behavior (RSVPed users still get all their configured windows)

## Recipient model

```
broadcast_recipients(event) =
  all members
  MINUS members who muted this series
  MINUS members who already received an at-start push via the RSVP path
  MINUS members without an active push_subscription row
```

Eligibility is "all members" — the simplest possible audience definition. The event's `visibility` flag is respected: events with `visibility = 'private'` skip broadcast entirely (assumes the existing column; if absent, the implementation plan must surface that).

## Send timing

One push per event per recipient, fired during the **at-start** reminder window (existing `push-start` window in `lib/notifications/reminder-dispatch.ts`). No advance broadcasts; no post-start follow-ups.

Dedupe key: `notification_log.type = 'broadcast.start'` with `unique(event_id, user_id, type)`. Cron tick is idempotent — re-running the same minute is a no-op.

## Mute model

### Table

```sql
event_mutes (
  id          serial primary key,
  member_id   int not null references members(id) on delete cascade,
  series_id   text not null,
  created_at  timestamptz default now(),
  unique(member_id, series_id)
);
create index event_mutes_member_idx on event_mutes(member_id);
```

`series_id` is the recurring parent's UUID if the event is part of a series, otherwise the event's own UUID. This collapses the recurring/one-off cases into one query path:

```sql
-- Is event E muted for member M?
exists (
  select 1 from event_mutes
  where member_id = $M
    and series_id = coalesce($event.recurrence_parent_id, $event.id)
)
```

### API

| Verb | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/events/{id}/mute` | `{}` | `{muted: true, seriesId: "..."}` |
| DELETE | `/api/events/{id}/mute` | `{}` | `{muted: false}` |
| GET | `/api/preferences/notifications/muted` | — | `{muted: [{seriesId, sampleEventTitle, mutedAt}]}` |

Auth: standard session (Clerk or NextAuth-Hylo) via `getAuthedUser()`. memberId derived server-side; never trusted from request body.

## UI surfaces

| Surface | Behavior |
|---|---|
| Push notification | Body: `"{title} is starting now"`. `data.url = "/events/{id}"`. Tap opens event detail. No native action buttons in v1. |
| `/events/{id}` (EventDetailView) | Prominent toggle: "🔕 Mute notifications for this series" / "🔔 Unmute". State derived from `event_mutes`. |
| Calendar grid card | Small bell-with-slash badge in corner if series is muted. Context-menu item "Mute series" / "Unmute series". |
| `/settings` (NotificationPreferences) | New section "Muted series" listing all the user's mutes with one-click unmute. |

## Code touch-points

1. **`src/lib/db/schema.ts`** — add `event_mutes` table + relation
2. **`src/lib/db/migrations/event-mutes.sql`** — Drizzle migration; remember to update `meta/_journal.json` (gotcha_drizzle_journal_missing)
3. **`src/lib/db/migrate.ts`** — wire `event_mutes` into `runMigrations`
4. **`src/lib/notifications/broadcast.ts`** *(new)* — pure helper: `computeBroadcastRecipients(db, event): Promise<member[]>`; tested independently with a fake DB
5. **`src/lib/notifications/mute-repo.ts`** *(new)* — `muteSeries`, `unmuteSeries`, `listMutedSeries`, `isSeriesMuted`
6. **`src/app/api/cron/send-reminders/route.ts`** — after existing RSVP fanout for the at-start window, call broadcast helper; write `notification_log` rows with `type='broadcast.start'`
7. **`src/app/api/events/[id]/mute/route.ts`** *(new)* — POST/DELETE handler
8. **`src/app/api/preferences/notifications/muted/route.ts`** *(new)* — GET handler for muted-series list
9. **`src/components/events/EventDetailView.tsx`** — mute toggle button + optimistic UI state
10. **`src/components/calendar/EventBlock.tsx`** (or actual grid-card component) — bell-slash indicator + context-menu action
11. **`src/components/NotificationPreferences.tsx`** — "Muted series" section with unmute buttons

## Guardrails

- **Audience cap**: skip broadcast if recipient set would exceed 500 members; log to `notification_log` with `type='broadcast.start.skipped-cap'` for visibility instead of failing silently. Reason: prevents accidental fanout on a malformed event/audience definition.
- **Private events**: `event.visibility = 'private'` → broadcast helper returns empty recipient set.
- **Already-sent dedupe**: enforced at DB level via `unique(event_id, user_id, type)` on `notification_log`.
- **Push subscription validity**: broadcast helper only counts members with at least one `push_subscriptions` row.

## Data flow

```
[Event starts]
  ↓
[Cron tick — every 5 min — send-reminders route]
  ↓
[Existing: dispatch RSVP-based reminders for this window]
  ↓
[NEW: for each event entering push-start window:
   recipients = computeBroadcastRecipients(db, event)
   for each recipient:
     try {
       sendPushToUsers([recipient.userId], {
         title: event.title,
         body: `${event.title} is starting now`,
         url: `/events/${event.id}`,
         tag: `broadcast-start-${event.id}`
       })
       insert notification_log (event_id, user_id, type='broadcast.start')
     } catch (UniqueViolationError) {
       // already sent — skip silently
     }
  ]
  ↓
[User taps push → opens /events/{id} → sees Mute toggle]
  ↓
[User taps Mute → POST /api/events/{id}/mute → insert event_mutes row]
```

## Testing

- **Unit tests** (Jest):
  - `mute-repo.test.ts` — muteSeries/unmuteSeries/listMutedSeries with a fake db
  - `broadcast.test.ts` — recipient computation: full set; minus muted; minus already-pushed; private event → empty; > 500 cap; no-subscription members excluded
- **E2E test** (Jest + supertest or fetch against Next dev):
  - POST `/api/events/{id}/mute` → verify row in `event_mutes`
  - Run send-reminders cron with mock event in window → verify `notification_log` row created for unmuted member, NOT created for muted member
- **Browser verification** (Chrome agent):
  - Open prod calendar → open event detail → tap Mute → verify toggle state persists across reload
  - Open settings page → see series in "Muted" list → tap unmute → verify removed

## Migration plan

1. Ship schema + migration in one commit; verify journal updated
2. Ship broadcast helper + cron call behind a feature env flag `BROADCAST_ENABLED=false` initially
3. Ship UI (mute toggles) — works regardless of cron flag
4. Flip flag to `true` in Vercel env; monitor `notification_log` for `broadcast.start` rows + push failures
5. Remove flag after 1 week of clean operation

## Open questions for implementation phase

- Does the existing `events` schema have `recurrence_parent_id` and `visibility`? Names may differ; the implementation plan must verify against current schema before assuming.
- The schema check above will determine whether the migration also needs to add `visibility` column with a default. If the column already exists, no-op; if it doesn't, the broadcast helper treats all events as public until a separate visibility feature ships.

## Open risks accepted

- **Member count growth**: 500-member cap is a soft ceiling for v1; revisit when community grows past that. Larger communities will need per-host/per-category subscriptions to avoid the fatigue cliff.
- **iOS PWA install gap**: members on iPhone who haven't installed the PWA receive no push regardless of broadcast logic. The feature is materially less effective for that segment. Accepted; install-promotion is a separate workstream.
- **Mute-then-RSVP edge case**: if a user mutes a series and later RSVPs to a specific instance, they currently get no notifications (mute wins). Implementation should make RSVP override mute for that one event instance — to be confirmed during plan writing.
