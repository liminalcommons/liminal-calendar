# Event Email Reminders

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Per-event opt-in email reminders for RSVP'd users

## Summary

When a user RSVPs to an event ("Going" or "Interested"), they can check a box to receive email reminders at 24hr, 1hr, and 15min before the event. Reminders are sent via Resend. A cron on chora-node triggers the dispatch every 5 minutes. Hylo handles new event alerts and invitations — this feature only covers timed reminders.

## Architecture

Two notification layers:

1. **ICS VALARM** (existing) — 15min pre-event alarm in the ICS feed. No changes needed.
2. **Email reminders** (new) — explicit opt-in per RSVP. Three timed emails per event.

```
User RSVPs + checks "Remind me"
  → rsvps.remindMe = true
  → chora-node cron (*/5 * * * *) hits POST /api/cron/send-reminders
  → Endpoint finds due reminders, checks notification_log, sends via Resend
  → Logs sent reminders to prevent duplicates
```

No QStash, no Vercel Pro, no new scheduler. Crontab on chora-node + one API endpoint.

## Schema Changes

### `rsvps` table — add column

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `remind_me` | boolean | false | User opted in to email reminders for this event |

### New table: `notification_log`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `event_id` | integer, NOT NULL | FK to events.id, cascade delete |
| `user_id` | text, NOT NULL | Hylo user ID |
| `type` | text, NOT NULL | `'24hr'`, `'1hr'`, `'15min'` |
| `sent_at` | timestamp with tz, default now | |

Unique constraint on `(event_id, user_id, type)` — prevents duplicate sends.

Index on `sent_at` for cleanup queries.

## Reminder Schedule

| Reminder | Window | Cron finds events starting in... |
|----------|--------|----------------------------------|
| 24hr | 24h-23h55m before | `starts_at BETWEEN now() + 23h55m AND now() + 24h` |
| 1hr | 1h-55m before | `starts_at BETWEEN now() + 55m AND now() + 1h` |
| 15min | 15m-10m before | `starts_at BETWEEN now() + 10m AND now() + 15m` |

5-minute cron interval means each window is ~5 minutes wide to avoid gaps.

## Email Content

**Provider:** Resend (free tier: 100 emails/day)
**Sender:** `calendar@liminalcommons.com`

### 24hr reminder
- **Subject:** "Tomorrow: {Event Title}"
- **Body:** Event title, date/time in user's timezone, location, meeting link (if any), description snippet, "View event" button linking to calendar.castalia.one
- **Footer:** "Stop reminders for this event" link

### 1hr reminder
- **Subject:** "{Event Title} starts in 1 hour"
- **Body:** Event title, time in user's timezone, meeting link prominent, location
- **Footer:** "Stop reminders for this event" link

### 15min reminder
- **Subject:** "{Event Title} starting soon!"
- **Body:** Minimal — meeting link or location, "Join now" button
- **Footer:** "Stop reminders for this event" link

All emails use plain HTML (no template engine). Inline CSS for email client compatibility. Mobile-friendly single-column layout.

## UI Changes

### RSVP buttons

When user clicks "Going" or "Interested", show a checkbox below the RSVP confirmation:

```
[Going]  [Interested]

[x] Email me reminders (24hr, 1hr, 15min before)
```

The checkbox appears after RSVP is saved, not before. Default unchecked. Toggling it PATCHes the RSVP's `remindMe` field.

If user already has `remindMe: true` and returns to the event, the checkbox is pre-checked.

### "Stop reminders" link in email

Each email contains a one-click link:
```
GET /api/notifications/stop-reminder?eventId=X&userId=Y&token=Z
```

- `token` is an HMAC of `eventId + userId` using `CRON_SECRET` as key (prevents abuse)
- Sets `remindMe = false` on the RSVP
- Returns simple HTML: "Reminders stopped for {Event Title}"

## Files

| File | Action |
|------|--------|
| `src/lib/db/schema.ts` | Add `remindMe` to rsvps, add `notification_log` table |
| `src/lib/email.ts` | **New** — Resend wrapper |
| `src/lib/notifications/reminders.ts` | **New** — reminder query + email builder |
| `src/app/api/cron/send-reminders/route.ts` | **New** — cron endpoint |
| `src/app/api/notifications/stop-reminder/route.ts` | **New** — unsubscribe per event |
| `src/app/api/events/[id]/rsvp/route.ts` | Extend to accept `remindMe` field |
| RSVP UI component (wherever RSVP buttons live) | Add checkbox |
| `vercel.json` | No change (cron runs on chora-node) |
| `package.json` | Add `resend` dependency |

## Cron Setup (chora-node)

```bash
# /etc/cron.d/liminal-calendar-reminders
*/5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://calendar.castalia.one/api/cron/send-reminders
```

## Environment Variables

| Variable | Where | Value |
|----------|-------|-------|
| `RESEND_API_KEY` | Vercel production | From Resend dashboard |
| `EMAIL_FROM` | Vercel production | `calendar@liminalcommons.com` |
| `CRON_SECRET` | Vercel production + chora-node | Already exists |

Domain `liminalcommons.com` must be verified in Resend for deliverability (SPF/DKIM DNS records).

## Scaling

| Community size | Events/week | Avg RSVPs with reminders | Emails/week | Resend tier |
|---|---|---|---|---|
| 50 | 3 | 5 | 45 | Free |
| 200 | 7 | 15 | 315 | Free |
| 500 | 15 | 30 | 1,350 | Paid ($20/mo) |

## Not in scope

- Daily/weekly digest emails (future phase)
- Push notifications (future phase)
- Global notification preferences on profile page
- Reminders for non-RSVP'd events
- ICS VALARM changes (already at 15min, sufficient)
