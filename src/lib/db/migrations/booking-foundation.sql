-- Booking foundation — additive, idempotent.
-- Re-runnable via /api/db-migrate.

-- 1. Add visibility + sourceEventTypeId to events.
ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
-- All pre-existing rows are public by current behavior; new rows default to private at the API layer.
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_event_type_id INTEGER;

-- 2. Add handle to members (nullable, unique).
ALTER TABLE members ADD COLUMN IF NOT EXISTS handle TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS members_handle_idx ON members(handle) WHERE handle IS NOT NULL;

-- 3. event_types — bookable templates (empty in this plan, populated in plan #3).
CREATE TABLE IF NOT EXISTS event_types (
  id                      SERIAL       PRIMARY KEY,
  owner_id                TEXT         NOT NULL,
  slug                    TEXT         NOT NULL,
  title                   TEXT         NOT NULL,
  description             TEXT,
  duration_minutes        INTEGER      NOT NULL,
  location_kind           TEXT         NOT NULL,
  location_value          TEXT,
  buffer_before_minutes   INTEGER      NOT NULL DEFAULT 0,
  buffer_after_minutes    INTEGER      NOT NULL DEFAULT 0,
  min_notice_minutes      INTEGER      NOT NULL DEFAULT 60,
  max_days_ahead          INTEGER      NOT NULL DEFAULT 30,
  active                  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT event_types_owner_slug_unique UNIQUE (owner_id, slug)
);

-- Now we can add the FK from events.source_event_type_id.
DO $$ BEGIN
  ALTER TABLE events
    ADD CONSTRAINT events_source_event_type_id_fkey
    FOREIGN KEY (source_event_type_id) REFERENCES event_types(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. bookable_windows — recurring weekly availability (empty in this plan).
CREATE TABLE IF NOT EXISTS bookable_windows (
  id            SERIAL       PRIMARY KEY,
  owner_id      TEXT         NOT NULL,
  day_of_week   INTEGER      NOT NULL,
  start_minute  INTEGER      NOT NULL,
  end_minute    INTEGER      NOT NULL,
  timezone      TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bookable_windows_owner_idx ON bookable_windows(owner_id);

-- 5. event_invitations — registered-user invitations (empty in this plan).
CREATE TABLE IF NOT EXISTS event_invitations (
  id                 SERIAL       PRIMARY KEY,
  event_id           INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invitee_user_id    TEXT         NOT NULL,
  invitee_name       TEXT         NOT NULL,
  invitee_image      TEXT,
  invited_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT event_invitations_event_invitee_unique UNIQUE (event_id, invitee_user_id)
);
CREATE INDEX IF NOT EXISTS event_invitations_invitee_idx ON event_invitations(invitee_user_id);

-- 6. visibility CHECK
DO $$ BEGIN
  ALTER TABLE events
    ADD CONSTRAINT events_visibility_check
    CHECK (visibility IN ('public','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
