-- =============================================
-- LIMINAL CALENDAR - RSVP & USERS MIGRATION
-- Run this in your Supabase SQL Editor
-- =============================================

-- Users table (for timezone sync and presence)
CREATE TABLE IF NOT EXISTS users (
  clerk_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  timezone_source TEXT NOT NULL DEFAULT 'browser',
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can upsert own data" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (true);

-- Users indexes
CREATE INDEX IF NOT EXISTS users_last_seen_idx ON users (last_seen);

-- =============================================
-- Event RSVPs / Commitments table
-- Tracks who has signed up to attend events
-- =============================================

CREATE TABLE event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,  -- Can be UUID (community) or google-* (google events)
  event_source TEXT NOT NULL DEFAULT 'community',  -- 'community' or 'google'
  user_id TEXT NOT NULL,  -- Clerk user ID
  user_name TEXT NOT NULL,
  user_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'going',  -- 'going', 'maybe', 'not_going'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one RSVP per user per event
  UNIQUE(event_id, user_id)
);

-- Enable RLS
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- Anyone can read RSVPs (to see who's attending)
CREATE POLICY "Public read RSVPs" ON event_rsvps FOR SELECT USING (true);

-- Authenticated users can create their own RSVPs
CREATE POLICY "Users can create own RSVPs" ON event_rsvps FOR INSERT
  WITH CHECK (true);

-- Users can update their own RSVPs
CREATE POLICY "Users can update own RSVPs" ON event_rsvps FOR UPDATE
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Users can delete their own RSVPs
CREATE POLICY "Users can delete own RSVPs" ON event_rsvps FOR DELETE
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Indexes for faster queries
CREATE INDEX event_rsvps_event_id_idx ON event_rsvps (event_id);
CREATE INDEX event_rsvps_user_id_idx ON event_rsvps (user_id);
CREATE INDEX event_rsvps_status_idx ON event_rsvps (status);
