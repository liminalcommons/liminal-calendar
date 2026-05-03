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

## Monitoring

`GET /api/cron/heartbeat` reports the most recent `notification_log.sent_at`:

```json
{ "status": "ok" | "stale" | "empty" | "error",
  "lastSentAt": "...", "ageSeconds": 123, "thresholdSeconds": 1800 }
```

Point an uptime monitor (e.g., UptimeRobot keyword check) at this URL every 15 min and alert when the response body contains `"status":"stale"`. That catches chora-node outages within ~30 minutes instead of discovering them from user reports days later.

## Operator playbook (post-deploy)

### Backfill — one-time, deploy-of-this-slice prerequisite

The 2026-05-02 notification-robustness slice (commit e64bf37 spec / fef7f8c plan) swapped the cron read path from `rsvps.remindMe` to a per-user `notification_preferences` table. Existing users without a preferences row are excluded from the cron's INNER JOIN — they will silently stop receiving notifications until they actively visit `/settings/notifications`.

To bridge: run the one-shot backfill that creates default preferences rows for every existing user in `rsvps`:

```bash
psql $DATABASE_URL -f src/lib/db/migrations/notification-preferences-backfill.sql
```

The migration is idempotent (`ON CONFLICT (user_id) DO NOTHING`); safe to re-run. Defaults match spec §5.1: push columns TRUE, email columns FALSE.

**Run this BEFORE the cron read-path swap is live** — otherwise users miss notifications between the swap going live and the backfill completing.

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
