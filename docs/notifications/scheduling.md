# Notification scheduling

How the reminder cron actually gets called, and what the code expects from the schedule.

## The endpoint

`GET /api/cron/send-reminders` (`src/app/api/cron/send-reminders/route.ts`)

- Auth: `Authorization: Bearer $CRON_SECRET` header required. Unset/missing → 401.
- Runtime: `export const dynamic = 'force-dynamic'`, `maxDuration = 30`.
- Returns JSON: `{ sent, skipped, errors, pushSent, timestamp }`.

## What it sends

| Channel | Horizons | Dedupe key (`notification_log.type`) | Source of truth |
|---------|----------|--------------------------------------|------------------|
| Email   | 24h, 1h, 15min before | `24hr` / `1hr` / `15min` | `rsvps.remindMe = true` AND `rsvps.status != 'no'` |
| Push    | 1h, 15min, at-start | `push-1hr` / `push-15min` / `push-start` | same RSVP filter, PLUS a row in `push_subscriptions` |

Each horizon uses a 10-minute-wide window (see `WINDOWS` and `PUSH_WINDOWS` in the route). Dedupe writes to `notification_log` on successful send so a re-tick inside the same window does not double-fire.

## Required cadence

The 10-minute window width implies the cron **must fire at least every 10 minutes**, otherwise events whose `startsAt` lands between ticks are missed. Every 5 minutes is the recommended target (keeps the logical delivery window tight and absorbs a missed tick).

## Where the schedule lives (as of 2026-04-18)

**Not in `vercel.json`.** `vercel.json` currently schedules only `/api/cron/materialize` (daily 06:00):

```json
{ "crons": [{ "path": "/api/cron/materialize", "schedule": "0 6 * * *" }] }
```

Per the original design spec (`docs/superpowers/specs/2026-04-09-event-email-reminders-design.md`), the trigger is a **chora-node crontab hitting the endpoint every 5 minutes** with the shared `CRON_SECRET`. That trigger config lives on `chora-node`, not in this repo.

**This is still a load-bearing externality** — if the chora-node cron drops the entry, reminders silently stop with no deploy-visible signal. A smoke test is to query `notification_log` for recent rows; no new rows over the last hour = the trigger is down.

## Why this repo does not own the schedule today

Vercel Hobby caps cron frequency to once per day; `send-reminders` needs every 5 minutes. The chosen path was to run the trigger from `chora-node` crontab so the schedule stays cheap. The trade-off is that the trigger config is not versioned with the application code.

## Action item

Copy the relevant chora-node crontab line into `packages/liminal-calendar/deploy/chora-node/crontab.example` so the schedule is versioned even though chora-node remains the executor. Anyone bringing up a new calendar host then has a reproducible starting point. Until that's done, treat "reminders fire" as an observed behavior, not a guaranteed one.
