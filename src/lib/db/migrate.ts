import { neon } from '@neondatabase/serverless';

/**
 * Run database migrations — creates tables if they don't exist.
 * Uses raw SQL since Drizzle Kit push/migrate requires CLI or node adapter.
 */
export async function runMigrations() {
  const url = process.env.DATABASE_URL || process.env.calender_DATABASE_URL || process.env.POSTGRES_URL || process.env.calender_POSTGRES_URL;
  if (!url) throw new Error('No database URL found');
  const sql = neon(url);

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

  // Create members table
  await sql`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      hylo_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add timezone and availability columns to members (idempotent)
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT '[]'`;

  // Clerk identity column — nullable so existing Hylo-only rows are unaffected.
  // Unique partial index allows multiple NULLs while preventing duplicate Clerk IDs.
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS clerk_id TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_members_clerk_id_unique ON members(clerk_id) WHERE clerk_id IS NOT NULL`;

  // Make hyloId nullable so Clerk-only sign-ups can insert without a Hylo
  // identity. Idempotent in PG ≥9.x — DROP NOT NULL on already-nullable
  // column is a no-op (no error).
  await sql`ALTER TABLE members ALTER COLUMN hylo_id DROP NOT NULL`;

  // Newsletter opt-in list — populated from RSVP, signup, or admin actions.
  // Independent of members table so non-member visitors can subscribe.
  await sql`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Create indexes for common queries
  await sql`CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_creator_id ON events(creator_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rsvps_user_id ON rsvps(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_members_hylo_id ON members(hylo_id)`;

  return { success: true, message: 'Migrations complete' };
}
