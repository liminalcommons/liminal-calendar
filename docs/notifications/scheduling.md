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

Operational evidence (user report) confirms `send-reminders` is firing today — the 15-minute push reliably lands — but the trigger source is **external to this repo**. Most plausible candidates:

1. A systemd user timer on `chora-node` hitting `https://calendar.castalia.one/api/cron/send-reminders` with the shared `CRON_SECRET`.
2. Another Vercel project (e.g. the old calendar deployment) whose cron is still active.
3. A third-party scheduler (cron-job.org, Upstash Scheduler, GitHub Actions).

**This is a load-bearing unknown.** If the external trigger stops, reminders silently stop with no deploy-visible signal.

## Why this repo does not own the schedule

Vercel Hobby caps cron frequency to once per day. At that cap `send-reminders` cannot satisfy its 10-minute window contract. Options to take ownership:

- **Upgrade to Vercel Pro** and add `{ "path": "/api/cron/send-reminders", "schedule": "*/5 * * * *" }` to `vercel.json`.
- **Self-host the trigger** on `chora-node` via a systemd timer and commit the unit file to `packages/liminal-calendar/deploy/` so the schedule is versioned.
- **Use an external scheduler** (Upstash, cron-job.org) and document its configuration here.

Any of the three is fine. Operating without **one** of them documented is the current risk.

## Action item

Replace this section with the chosen source of truth — plan, credentials location (which env variable), and how to confirm it's running (check `notification_log` for recent rows, or the function's Vercel logs). Until that is done, treat "reminders fire" as an observed behavior, not a guaranteed one.
