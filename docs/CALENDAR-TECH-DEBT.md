# liminal-calendar — technical debt catalog

Living document. Items captured here are known-but-deferred; adding an item means "we know this is a problem and have chosen not to fix it yet." Fixing an item means deleting its entry (not marking it done).

**Priority legend**
- **P1** — active risk: can cause user-visible regressions, data loss, or silent drift if left.
- **P2** — friction: slows future work, creates inconsistency, but users don't feel it today.
- **P3** — hygiene: stylistic / cleanliness; worth doing on a rainy day.

**Last reviewed**: 2026-04-18

---

## P1 — Risk

### P1.1 — External cron trigger is undocumented and unowned
`/api/cron/send-reminders` requires a 10-minute cadence (see `docs/notifications/scheduling.md`), but no schedule lives in this repo. Reminders fire today because something external is calling the endpoint — that something is not versioned here. If the external caller disappears, reminders silently stop. Three possible fixes (Vercel Pro cron entry, chora-node systemd unit committed to `deploy/`, 3rd-party scheduler whose config lives here). Pick one.

### P1.2 — No tests for 21 of 22 API routes
Before `rsvp-upsert.test.ts` (75abc56) the route layer had zero tests. One file now, 21 routes to go. Prioritize the ones that mutate data: `events/[id]/rsvp`, `events` POST, `push/subscribe`, `cron/send-reminders`, `cron/materialize`, `groups/*`, `profile`. The extraction pattern used for `upsertRsvp` (pure helper + tiny route wrapper + regression-guard test) is the template.

### P1.3 — Token-refresh path noted broken in session memory
User memory note: "Token auto-refresh broken (reverted 3x)". Implication: sessions silently expire mid-use and the frontend has to handle a 401, which is brittle. No owner, no ticket, no test. Needs a proper investigation cycle — reproduce, document, fix with a regression test.

---

## P2 — Friction

### P2.1 — Admin allowlist hardcoded in `auth.ts`
`ADMIN_HYLO_IDS = ['67402', '69224', '55015', '69655']` lives in the auth module. Adding/removing an admin requires a code change + deploy. Move to env var or to a `members.role` column (which already exists on the schema — see `members.role`). Config-in-code on a repo without CODEOWNERS = any contributor can silently grant admin to themselves.

### P2.2 — Client-side recurrence expansion
`expandRecurringEvents` runs in the browser for a rolling 1-month-back / 6-month-forward window. Works today but scales poorly as users add recurring events, and it means the same expansion logic has to live in both JS (display) and SQL (ICS feed). A server-side materialization of instances (with a cache-friendly flat table) would unify the two and shrink the wire payload.

---

## P3 — Hygiene

### P3.1 — Large working-tree modifications not committed
`git status` in the submodule shows 12 uncommitted modified files (`auth.ts`, `package.json`, `src/lib/auth-helpers.ts`, `src/lib/recurrence.ts`, several API routes). Either commit or revert — sitting in the working tree is state that future agents can accidentally incorporate into unrelated commits.

### P3.2 — `docs/superpowers/plans/` and `docs/superpowers/specs/` untracked
Two markdown specs for event-email-reminders are untracked in `git status`. If they're load-bearing, commit them; if they were scratch notes, delete them.

### P3.3 — `EventExpansion.tsx` is 470 LOC
Single React component doing expansion animation, title editing, RSVP, delete, recurrence display, and share. Hard to test in isolation. Split along the natural seams (one sub-component per concern) so each has a clean test target.

### P3.4 — Session callback complexity in `auth.ts`
`auth.ts` mixes Hylo OAuth config, admin role assignment, member row creation (`members` table upsert), feed-token generation, and session shape. A lot of policy in one file. Factor into `auth/providers`, `auth/role-resolver`, `auth/member-sync` so changes to one aspect don't pretend to change the others.

---

## How to use this file

1. Opening a PR that fixes an item here → **delete** the section, reference it in the PR description. Don't leave "DONE ✓" markers.
2. Discovering a new debt item mid-work → add a section rather than silently leaving it. Future agents benefit more from a catalog than from individual TODOs scattered in code.
3. This file intentionally has no owners or due dates — the honest state is "we know, we haven't decided." Adding a date implies a commitment that isn't real. When someone commits, they should edit the item to name themselves and a week.
