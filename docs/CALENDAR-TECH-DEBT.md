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

### P1.3 — Chora-node crontab versioned as example only
`deploy/chora-node/crontab.example` now documents the expected schedule, but the **actual** crontab still lives unversioned on `chora-node`. No smoke-test alarm fires if the trigger drops. Either (a) build a small `send-reminders-heartbeat` check that pages on silence, or (b) move the schedule into versioned infra (systemd unit checked in, Vercel Pro cron, 3rd-party scheduler with config-in-repo).

---

## P2 — Friction

### P2.1 — Client-side recurrence expansion
`expandRecurringEvents` runs in the browser for a rolling 1-month-back / 6-month-forward window. Works today but scales poorly as users add recurring events, and it means the same expansion logic has to live in both JS (display) and SQL (ICS feed). A server-side materialization of instances (with a cache-friendly flat table) would unify the two and shrink the wire payload.

---

## P3 — Hygiene

### P3.1 — Large working-tree modifications not committed
`git status` in the submodule shows 12 uncommitted modified files (`auth.ts`, `package.json`, `src/lib/auth-helpers.ts`, `src/lib/recurrence.ts`, several API routes). Either commit or revert — sitting in the working tree is state that future agents can accidentally incorporate into unrelated commits.

### P3.2 — `EventExpansion.tsx` still 428 LOC of handlers + JSX
Pure-function helpers have been extracted to `event-expansion-utils.ts` (placement math, duration formatting, date formatting, recurrence-id stripping) with 12 tests locking their behavior. What remains is genuinely component logic: state hooks, RSVP handler, title-edit handler, delete-confirm flow, position effect, JSX. Next slice would be a `TitleEditor` or `DeleteConfirmDialog` sub-component; lower priority than the untested routes above.

### P3.3 — `auth.ts` still has provider + member-sync + session in one file
Role resolution has been extracted to `src/lib/auth/role.ts` with 10 tests covering both the jwt-time precedence (allowlist > moderator > member > undefined-for-non-members) and the session-time precedence (DB override > allowlist > token > 'member'). Still mixed in the remaining ~230 LOC of `auth.ts`: Hylo OAuth provider config, member row upsert (with feed-token backfill), and session-token shape. Further factoring would be `auth/providers.ts` + `auth/member-sync.ts` — lower-priority because those pieces each touch NextAuth internals and cannot be extracted without threading a lot of typed context.

---

## How to use this file

1. Opening a PR that fixes an item here → **delete** the section, reference it in the PR description. Don't leave "DONE ✓" markers.
2. Discovering a new debt item mid-work → add a section rather than silently leaving it. Future agents benefit more from a catalog than from individual TODOs scattered in code.
3. This file intentionally has no owners or due dates — the honest state is "we know, we haven't decided." Adding a date implies a commitment that isn't real. When someone commits, they should edit the item to name themselves and a week.
