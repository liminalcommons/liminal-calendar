-- Backfill notification_preferences for existing users.
--
-- WHY: Task 4 (commit 76ad9b8) swapped the cron read path from
-- `eq(rsvps.remindMe, true)` to an INNER JOIN on notification_preferences.
-- Existing production users with RSVPs but no prefs row would be silently
-- excluded from notifications until they actively visit the new settings
-- page. The spec §5.1 lazy-insert pattern only fires when a user reads
-- their preferences (via GET /api/preferences/notifications), so users
-- who dismissed onboarding via localStorage `calendar-subscribe-dismissed`
-- never trigger it.
--
-- HOW: One-shot INSERT that pulls every distinct user_id from rsvps and
-- creates a notification_preferences row at the column defaults
-- (push columns TRUE, email columns FALSE — matches spec §5.1 defaults).
-- ON CONFLICT DO NOTHING makes this idempotent: re-running is safe.
--
-- WHEN TO RUN: once, at the deploy of the slice that includes Task 4.
-- After this runs, the cron's INNER JOIN will include all existing users
-- at the spec's stated defaults. Future new users get rows lazily via
-- ensurePreferences as they interact with onboarding/settings.
--
-- Run idempotently with: psql $DATABASE_URL -f notification-preferences-backfill.sql

INSERT INTO notification_preferences (user_id)
SELECT DISTINCT user_id FROM rsvps
ON CONFLICT (user_id) DO NOTHING;
