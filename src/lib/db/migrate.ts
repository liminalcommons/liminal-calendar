import { neon } from '@neondatabase/serverless';

/**
 * Run database migrations — creates tables if they don't exist.
 * Uses raw SQL since Drizzle Kit push/migrate requires CLI or node adapter.
 */
export async function runMigrations() {
  const sql = neon(process.env.DATABASE_URL!);

  // Create events table
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ,
      timezone TEXT DEFAULT 'UTC',
      location TEXT,
      image_url TEXT,
      recurrence_rule TEXT,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      creator_image TEXT,
      hylo_group_id TEXT,
      hylo_post_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Create rsvps table
  await sql`
    CREATE TABLE IF NOT EXISTS rsvps (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_image TEXT,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(event_id, user_id)
    )
  `;

  // Create indexes for common queries
  await sql`CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_creator_id ON events(creator_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rsvps_user_id ON rsvps(user_id)`;

  return { success: true, message: 'Migrations complete' };
}
