CREATE TABLE IF NOT EXISTS event_mutes (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, event_id)
);
CREATE INDEX IF NOT EXISTS event_mutes_member_idx ON event_mutes(member_id);
