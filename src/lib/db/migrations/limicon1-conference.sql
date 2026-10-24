-- Limicon1: time-boxed conference scope on events.
-- A conference is a record plus a scope, never a fork. Transferring an event
-- to the permanent calendar = clearing its conference_id; ending a conference
-- = excluding still-linked rows from queries. No deletion anywhere.
CREATE TABLE IF NOT EXISTS conferences (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE events ADD COLUMN IF NOT EXISTS conference_id INTEGER REFERENCES conferences(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS continue_beyond BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS category_other TEXT;
CREATE INDEX IF NOT EXISTS events_conference_idx ON events(conference_id);
-- The old visibility CHECK (public/private only) predates the members tier.
-- Widen it: members-tier events are members-visible, never anonymous.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_visibility_check;
ALTER TABLE events ADD CONSTRAINT events_visibility_check CHECK (visibility IN ('public', 'private', 'members'));
-- Seed row. Dates NULL until Erik confirms the month; the admin conference panel sets them.
INSERT INTO conferences (slug, name, status)
  VALUES ('limicon1', 'Limicon 2027', 'upcoming')
  ON CONFLICT (slug) DO NOTHING;
