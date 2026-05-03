-- Event comments + attendance reports — additive migration.
-- Idempotent so /api/db-migrate can re-run safely.

CREATE TABLE IF NOT EXISTS event_comments (
  id              SERIAL       PRIMARY KEY,
  event_id        INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id       TEXT         NOT NULL,
  author_name     TEXT         NOT NULL,
  author_image    TEXT,
  body            TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS event_comments_event_idx
  ON event_comments(event_id, created_at);

CREATE TABLE IF NOT EXISTS attendance_reports (
  id              SERIAL       PRIMARY KEY,
  event_id        INTEGER      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reporter_id     TEXT         NOT NULL,
  reporter_name   TEXT         NOT NULL,
  event_happened  BOOLEAN      NOT NULL,
  host_present    BOOLEAN      NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_report_event_reporter_unique UNIQUE (event_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS attendance_reports_event_idx
  ON attendance_reports(event_id);
