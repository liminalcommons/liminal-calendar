# Migration plan: server-side recurrence materialization

**Status:** proposed. Not yet implemented — this document exists so the next person picking up the work doesn't have to re-derive the shape of the problem.

## Current state (2026-04-20)

Recurring events are stored as a single "master" row in `events` with a `recurrenceRule` string (RFC 5545 RRULE-style). The master row's `startsAt` is the original creation time.

Display uses `expandRecurringEvents(events, rangeStart, rangeEnd)` — a **pure client-side function** called from:

- `useEvents` (week grid, month grid)
- `src/app/list/page.tsx` (list view, added this session to fix "0 events" bug)

Separately, `src/app/api/calendar/feed.ics/route.ts` generates an ICS feed using its **own expansion logic** (VEVENT with RRULE), so subscription clients (Google Calendar, Apple, Outlook) handle expansion themselves.

## Problems

1. **Duplicate logic.** JS expansion for display and VEVENT+RRULE for ICS — any RRULE semantics change has to land in two places. Easy to drift.
2. **Scales with viewers, not with events.** A 5-year-old recurring event is re-expanded in every browser, every page load, for a rolling 7-month window.
3. **Payload bloat.** `GET /api/events` returns master rows, the client re-expands. On clients with poor CPU (older phones), the math shows up as render jank.
4. **Edit semantics are murky.** "Delete this occurrence" vs "Delete series" is awkward because the DB only holds the series.

## Target

Add an `event_instances` table with `(id, master_event_id, starts_at, ends_at, status)` and materialize instances server-side. `cron/materialize` already materializes into Hylo (for the community calendar sync); extend it to also populate `event_instances` locally. `GET /api/events` then returns flat instance rows; client-side `expandRecurringEvents` becomes a no-op / is deleted.

## Migration steps

1. **Schema** — add `event_instances` table, FK to `events(id)` with `ON DELETE CASCADE`. Add index on `(starts_at)`.
2. **Writer** — extend `cron/materialize` to insert into `event_instances` in addition to its Hylo calls. Keep the Hylo side intact (that's the community sync; separate concern).
3. **Reader** — add `GET /api/events/instances?from&to` that returns rows from `event_instances` joined with `events` for the metadata. Leave the existing `GET /api/events` returning master rows for now (feed.ics still needs them).
4. **Client** — route `useEvents` + list page at the new `/instances` endpoint. Remove `expandRecurringEvents` call from all 3 call sites. Keep the function in the codebase for the ICS feed generator or delete it from the ICS path too.
5. **Backfill** — one-off migration that expands every existing master row into `event_instances` over the current 1-back/7-forward window so the cutover doesn't leave a gap.
6. **Per-occurrence edits** — once the table exists, "delete this occurrence" becomes `DELETE FROM event_instances WHERE id = ?` (vs. adding an EXDATE to the master's RRULE). Ships as a follow-up; the first migration is display-only.

## Costs

- Schema migration + drizzle codegen + Vercel env `DATABASE_URL` migrations.
- `cron/materialize` gets more complex — has to dedupe on both Hylo and local writes.
- Feed URL cache invalidation — subscribers pull their own schedule, any change to how we expand affects what they see.
- ~1-2 days of focused work + careful staging verification. This is not a 30-minute cleanup pass.

## Why not now

This debt was flagged as P2 (friction, not risk) and the performance hit only matters when the number of recurring events grows beyond ~50. Today the Liminal Commons calendar has ~20 recurring series; the client-side expansion runs in <5ms. Fixing it now is premature optimization for a not-yet-felt problem. Revisit when either:

- the calendar crosses ~100 recurring series, OR
- a real user reports load-time jank on mobile, OR
- someone wants to ship per-occurrence edits.
