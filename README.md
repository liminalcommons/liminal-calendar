# Liminal Calendar

A community calendar for distributed teams with **Golden Hours** - optimal meeting times for global coordination.

## Features

- **Golden Hours Display**: Shows optimal meeting times for Europe, Americas, and Brazil overlap
- **Self-Service Events**: Any member can create events, only creators can edit/delete
- **Time Zone Intelligence**: Auto-detects user's timezone, shows events in local time
- **Soft Nudge**: Warning when scheduling outside Golden Hours (not blocking)
- **No Admin Required**: Fully self-service, no gatekeepers

## Golden Hours

Optimal overlap times for Liminal Commons:

| Region | Weekdays (2h) | Weekends (3h) |
|--------|---------------|---------------|
| Europe (CET) | 20:00-22:00 | 18:00-21:00 |
| Brazil (BRT) | 16:00-18:00 | 14:00-17:00 |
| NYC (EST) | 14:00-16:00 | 12:00-15:00 |
| Texas (CST) | 13:00-15:00 | 11:00-14:00 |
| California (PST) | 11:00-13:00 | 09:00-12:00 |

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.local.example` to `.env.local` and fill in:

```bash
cp .env.local.example .env.local
```

**Clerk (Authentication):**
1. Go to [clerk.com](https://clerk.com) and create an application
2. Copy your Publishable Key and Secret Key

**Supabase (Database):**
1. Go to [supabase.com](https://supabase.com) and create a project
2. Copy your Project URL and anon key
3. Run the SQL schema below

### 3. Database Schema

Run this in your Supabase SQL editor:

```sql
-- Events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_url TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  timezone TEXT NOT NULL,
  is_golden_hour BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Anyone can read events
CREATE POLICY "Public read" ON events FOR SELECT USING (true);

-- Authenticated users can create
CREATE POLICY "Auth create" ON events FOR INSERT
  WITH CHECK (true);

-- Only creator can update
CREATE POLICY "Creator update" ON events FOR UPDATE
  USING (creator_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Only creator can delete
CREATE POLICY "Creator delete" ON events FOR DELETE
  USING (creator_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Index for faster queries
CREATE INDEX events_starts_at_idx ON events (starts_at);
CREATE INDEX events_status_idx ON events (status);
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy!

## Tech Stack

- **Next.js 15** - React framework
- **Clerk** - Authentication
- **Supabase** - PostgreSQL database
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety

## License

MIT
