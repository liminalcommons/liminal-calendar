-- =============================================
-- LIMINAL CALENDAR - CALENDAR UPGRADES MIGRATION
-- Run this in your Supabase SQL Editor
-- Adds: Recurring events, visibility, event types, reminders
-- =============================================

-- =============================================
-- RECURRING EVENTS SUPPORT
-- =============================================

-- Add recurrence columns to events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
  ADD COLUMN IF NOT EXISTS series_id UUID,
  ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES events(id);

-- Index for finding events in a series
CREATE INDEX IF NOT EXISTS events_series_id_idx ON events (series_id) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_parent_event_id_idx ON events (parent_event_id) WHERE parent_event_id IS NOT NULL;

-- =============================================
-- EVENT VISIBILITY / ACCESS CONTROL
-- =============================================

-- Add visibility columns
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS allowed_emails TEXT[];

-- Add check constraint for visibility values
ALTER TABLE events
  ADD CONSTRAINT events_visibility_check
  CHECK (visibility IN ('public', 'members_only', 'invite_only'));

-- Drop existing select policy and create new visibility-aware policy
DROP POLICY IF EXISTS "Events visible based on visibility" ON events;

CREATE POLICY "Events visible based on visibility" ON events
FOR SELECT USING (
  -- Public events visible to all
  visibility = 'public'
  -- Members-only requires authentication
  OR (visibility = 'members_only' AND auth.jwt() IS NOT NULL)
  -- Invite-only requires email in allowed list
  OR (visibility = 'invite_only' AND auth.jwt()->>'email' = ANY(allowed_emails))
  -- Creator can always see their own events
  OR creator_id = auth.jwt()->>'sub'
);

-- =============================================
-- EVENT TYPES / CATEGORIES
-- =============================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'general';

-- Add check constraint for event type values
ALTER TABLE events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('general', 'presentation', 'workshop', 'social', 'meeting', 'standup'));

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS events_event_type_idx ON events (event_type);

-- =============================================
-- EMAIL REMINDERS
-- =============================================

CREATE TABLE IF NOT EXISTS event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Foreign key to event_rsvps for referential integrity
  -- Note: We don't FK to events because event_id can be google-* string
  CONSTRAINT unique_reminder_per_user_event UNIQUE(event_id, user_id)
);

-- Enable RLS on reminders
ALTER TABLE event_reminders ENABLE ROW LEVEL SECURITY;

-- Users can see their own reminders
CREATE POLICY "Users can read own reminders" ON event_reminders
FOR SELECT USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Users can create reminders for themselves
CREATE POLICY "Users can create own reminders" ON event_reminders
FOR INSERT WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Users can update their own reminders
CREATE POLICY "Users can update own reminders" ON event_reminders
FOR UPDATE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Users can delete their own reminders
CREATE POLICY "Users can delete own reminders" ON event_reminders
FOR DELETE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Index for cron job to find pending reminders efficiently
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON event_reminders(remind_at)
WHERE sent = FALSE;

-- Index for looking up reminders by user
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON event_reminders(user_id);

-- =============================================
-- HELPER FUNCTION: Auto-create reminder on RSVP
-- =============================================

-- Function to create a 24h reminder when user RSVPs 'going'
CREATE OR REPLACE FUNCTION create_rsvp_reminder()
RETURNS TRIGGER AS $$
DECLARE
  event_start TIMESTAMPTZ;
  user_email_addr TEXT;
BEGIN
  -- Only create reminder for 'going' status
  IF NEW.status != 'going' THEN
    -- If changing away from 'going', delete the reminder
    DELETE FROM event_reminders
    WHERE event_id = NEW.event_id::UUID AND user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- Get event start time (only for community events with UUID format)
  IF NEW.event_source = 'community' THEN
    SELECT starts_at INTO event_start
    FROM events
    WHERE id = NEW.event_id::UUID;

    -- Get user email from users table
    SELECT email INTO user_email_addr
    FROM users
    WHERE clerk_id = NEW.user_id;

    -- Only create reminder if we have both event time and user email
    IF event_start IS NOT NULL AND user_email_addr IS NOT NULL THEN
      -- Insert or update reminder for 24 hours before event
      INSERT INTO event_reminders (event_id, user_id, user_email, remind_at)
      VALUES (NEW.event_id::UUID, NEW.user_id, user_email_addr, event_start - INTERVAL '24 hours')
      ON CONFLICT (event_id, user_id)
      DO UPDATE SET remind_at = event_start - INTERVAL '24 hours', sent = FALSE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on RSVP insert/update
DROP TRIGGER IF EXISTS trigger_create_rsvp_reminder ON event_rsvps;
CREATE TRIGGER trigger_create_rsvp_reminder
AFTER INSERT OR UPDATE ON event_rsvps
FOR EACH ROW
EXECUTE FUNCTION create_rsvp_reminder();
