# liminal-calendar — technical debt catalog

Living document. Items captured here are known-but-deferred; adding an item means "we know this is a problem and have chosen not to fix it yet." Fixing an item means deleting its entry (not marking it done).

**Priority legend**
- **P1** — active risk: can cause user-visible regressions, data loss, or silent drift if left.
- **P2** — friction: slows future work, creates inconsistency, but users don't feel it today.
- **P3** — hygiene: stylistic / cleanliness; worth doing on a rainy day.

**Last reviewed**: 2026-04-20

---

## P1 — Risk

### P1.1 — Mutating API routes still untested
Tests now cover `events/[id]/rsvp` (via `upsertRsvp`), `events` POST (via `validateCreateEventInput`), `push/subscribe` (via `validateSubscription`+insert/delete), `cron/send-reminders` (via `reminder-dispatch` helpers), `notifications/stop-reminder` (via `stopReminderToken` + `verifyStopToken`), and `cron/materialize` (via `filterNewOccurrences`) — 60 tests across six routes. Still untested: `groups/*`, `profile` update, `upload`, `bug-report`, `scheduling/suggest`, `push/vapid-key`, `admin/*`, `members/*`, `zones`, `chat`, `generate-image`, `db-migrate`, `import-hylo`. Extraction template is `src/lib/rsvp/upsert.ts` + `src/__tests__/lib/rsvp-upsert.test.ts`.

### P1.2 — Token-refresh still architecturally delegated to the auth gateway
Investigation outcome: refresh is deliberately handled by `auth.castalia.one` (see comment at `auth.ts`). Automatic refresh inside this app is not viable because the Hylo app's Universal Link hijack on mobile breaks any in-app OAuth start attempt (hence the revert history). The UX failure mode has been softened: `apiFetch` now emits a `calendar:session-expired` window event on 401, and `SessionExpiredBanner` (mounted in root layout) renders a visible "Your session expired — Sign in" toast. Remaining risk: the underlying refresh still doesn't happen transparently; a real fix has to live in the auth-gateway repo, not here.

### P1.3 — Chora-node crontab still executes off-repo
`deploy/chora-node/crontab.example` versions the schedule template, and `GET /api/cron/heartbeat` exposes staleness (see `docs/notifications/scheduling.md` for the uptime-monitor recipe). What's still missing: the actual running crontab on chora-node is not automatically reconciled with the example file, and no external uptime monitor is wired to the heartbeat endpoint yet. Operational action, not a code change — plug UptimeRobot (or equivalent) into the heartbeat URL with a keyword alert on `"status":"stale"`.

---

## P2 — Friction

### P2.1 — Client-side recurrence expansion (migration plan drafted, not executed)
`expandRecurringEvents` still runs in the browser on every page load. Full plan for moving to server-side materialization (schema, writer, reader, client cutover, backfill, per-occurrence edits) lives in `docs/architecture/recurrence-materialization-plan.md`. Deliberately deferred: the perf hit is not yet felt (~20 recurring series, <5ms expansion), and the migration is a 1-2 day effort with a staging-verification tail. Revisit when ~100 series, load-time jank reports, or per-occurrence edits are on the roadmap.

---

## P3 — Hygiene

### P3.1 — Large working-tree modifications not committed
`git status` in the submodule shows 12 uncommitted modified files (`auth.ts`, `package.json`, `src/lib/auth-helpers.ts`, `src/lib/recurrence.ts`, several API routes). Either commit or revert — sitting in the working tree is state that future agents can accidentally incorporate into unrelated commits.

### P3.2 — `EventExpansion.tsx` down to 393 LOC of hooks + JSX
Pure helpers (event-expansion-utils, 12 tests) and the delete-confirm footer (DeleteConfirm component, ~60 LOC moved out) are extracted. What remains is state wiring + RSVP/title-edit/position effects + the JSX tree. Further splitting would need a `TitleEditor` sub-component — low priority now that the test-covered surface area is meaningful.

---

## How to use this file

1. Opening a PR that fixes an item here → **delete** the section, reference it in the PR description. Don't leave "DONE ✓" markers.
2. Discovering a new debt item mid-work → add a section rather than silently leaving it. Future agents benefit more from a catalog than from individual TODOs scattered in code.
3. This file intentionally has no owners or due dates — the honest state is "we know, we haven't decided." Adding a date implies a commitment that isn't real. When someone commits, they should edit the item to name themselves and a week.
