-- Phase 1 of identity canonicalization (additive only).
--
-- Goal: introduce members.id (integer) as the canonical person identifier.
-- Every table that currently points at a person via a provider-specific
-- string (hyloId or clerkId) gets a nullable member_id INTEGER REFERENCES
-- members(id). This phase ONLY adds columns and backfills them. Reads
-- and writes still use the legacy string columns — phase 2 will dual-write,
-- phase 3 will flip reads, phase 4 will drop the legacy columns.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- Each ALTER is wrapped in a DO block guarded by to_regclass() so the
-- migration is robust to tables that exist in schema.ts but were never
-- materialized in this database (push_subscriptions, marketplace_submissions
-- are in schema.ts but absent from prod as of 2026-05-09).

-- ─── events.creator → member_id ──────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.events') IS NOT NULL THEN
    ALTER TABLE events ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS events_member_id_idx ON events(member_id);
  END IF;
END $$;

-- ─── rsvps.user → member_id ──────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.rsvps') IS NOT NULL THEN
    ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS rsvps_member_id_idx ON rsvps(member_id);
  END IF;
END $$;

-- ─── event_comments.author → member_id ───────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.event_comments') IS NOT NULL THEN
    ALTER TABLE event_comments ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS event_comments_member_id_idx ON event_comments(member_id);
  END IF;
END $$;

-- ─── attendance_reports.reporter → member_id ─────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.attendance_reports') IS NOT NULL THEN
    ALTER TABLE attendance_reports ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS attendance_reports_member_id_idx ON attendance_reports(member_id);
  END IF;
END $$;

-- ─── event_invitations.invitee → member_id ───────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.event_invitations') IS NOT NULL THEN
    ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS event_invitations_member_id_idx ON event_invitations(member_id);
  END IF;
END $$;

-- ─── notifications: recipient + actor ────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS notifications_member_recent_idx ON notifications(member_id, created_at);
  END IF;
END $$;

-- ─── push_subscriptions.user → member_id (only if table exists) ──────────
DO $$ BEGIN
  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS push_subscriptions_member_id_idx ON push_subscriptions(member_id);
  END IF;
END $$;

-- ─── notification_preferences.user → member_id ───────────────────────────
DO $$ BEGIN
  IF to_regclass('public.notification_preferences') IS NOT NULL THEN
    ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS notification_preferences_member_id_idx ON notification_preferences(member_id);
  END IF;
END $$;

-- ─── notification_log.user → member_id ───────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.notification_log') IS NOT NULL THEN
    ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS notification_log_member_id_idx ON notification_log(member_id);
  END IF;
END $$;

-- ─── event_types.owner → owner_member_id ─────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.event_types') IS NOT NULL THEN
    ALTER TABLE event_types ADD COLUMN IF NOT EXISTS owner_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS event_types_owner_member_id_idx ON event_types(owner_member_id);
  END IF;
END $$;

-- ─── bookable_windows.owner → owner_member_id ────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.bookable_windows') IS NOT NULL THEN
    ALTER TABLE bookable_windows ADD COLUMN IF NOT EXISTS owner_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS bookable_windows_owner_member_id_idx ON bookable_windows(owner_member_id);
  END IF;
END $$;

-- ─── marketplace_submissions.submitter → submitter_member_id (if exists) ─
DO $$ BEGIN
  IF to_regclass('public.marketplace_submissions') IS NOT NULL THEN
    ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS submitter_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS marketplace_submissions_submitter_member_id_idx ON marketplace_submissions(submitter_member_id);
  END IF;
END $$;

-- ─── image_generations.user → member_id (live in prod, not yet in schema.ts) ─
DO $$ BEGIN
  IF to_regclass('public.image_generations') IS NOT NULL THEN
    ALTER TABLE image_generations ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS image_generations_member_id_idx ON image_generations(member_id);
  END IF;
END $$;
