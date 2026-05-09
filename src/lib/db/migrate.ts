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
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS clerk_id TEXT`;

  // Unique constraint on clerk_id. Postgres allows multiple NULLs in a
  // regular UNIQUE column by default, so this gives us the same
  // multi-NULL tolerance as the prior partial unique index — but
  // critically, a regular UNIQUE constraint is recognized by
  // `INSERT ... ON CONFLICT (clerk_id) DO UPDATE`, whereas a partial
  // unique index is NOT (Postgres error 42P10: "no unique or exclusion
  // constraint matching the ON CONFLICT specification").
  //
  // The earlier `idx_members_clerk_id_unique WHERE clerk_id IS NOT
  // NULL` is now redundant — drop it before/after adding the
  // constraint. This silently broke every fresh Clerk-only signup
  // (the webhook's syncClerkMember.insert path) until 2026-05-02.
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'members_clerk_id_key'
          AND conrelid = 'members'::regclass
      ) THEN
        ALTER TABLE members
          ADD CONSTRAINT members_clerk_id_key UNIQUE (clerk_id);
      END IF;
    END $$
  `;
  await sql`DROP INDEX IF EXISTS idx_members_clerk_id_unique`;

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

  // Defense-in-depth: enforce the (hyloId || clerkId) Member invariant
  // at the DB level. Helpers (syncMember, syncClerkMember,
  // syncClerkMemberWithMerge) already enforce at app level — this
  // guards against future code (or direct SQL) that bypasses them.
  // Idempotent via DO block + pg_constraint check, since PostgreSQL
  // lacks `ADD CONSTRAINT IF NOT EXISTS` for CHECK constraints.
  // Existing rows satisfy the constraint: pre-S3.1 rows have non-null
  // hyloId; S3.2+ rows come through helpers that always set one or
  // both columns. Constraint addition will only fail if orphan rows
  // exist with both columns null — none should in normal flow.
  // Logto column: third identity provider (Castalia is migrating to
  // Logto as canonical signin). Additive — existing rows keep their
  // hylo_id / clerk_id; first Logto signin attaches logto_id to the
  // matching row by email.
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS logto_id TEXT`;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'members_logto_id_unique'
          AND conrelid = 'members'::regclass
      ) THEN
        ALTER TABLE members
          ADD CONSTRAINT members_logto_id_unique UNIQUE (logto_id);
      END IF;
    END $$
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_members_logto_id ON members(logto_id)`;

  // Identity CHECK constraint — broadened to allow logto_id as the
  // sole non-null identity. Drop+recreate so re-runs converge on the
  // current 3-way predicate even if an older 2-way version exists.
  await sql`ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_members_identity`;
  await sql`
    ALTER TABLE members
      ADD CONSTRAINT chk_members_identity
      CHECK (hylo_id IS NOT NULL OR clerk_id IS NOT NULL OR logto_id IS NOT NULL)
  `;

  // Create indexes for common queries
  await sql`CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_creator_id ON events(creator_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rsvps_user_id ON rsvps(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_members_hylo_id ON members(hylo_id)`;

  // Event comments — flat list, soft-deletable. See
  // src/lib/db/migrations/event-comments-reports.sql for the canonical
  // statement; this is the runtime mirror so /api/db-migrate is one call.
  await sql`
    CREATE TABLE IF NOT EXISTS event_comments (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_image TEXT,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS event_comments_event_idx ON event_comments(event_id, created_at)`;

  // Post-event attendance reports — one row per (event, reporter), upsert.
  await sql`
    CREATE TABLE IF NOT EXISTS attendance_reports (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      event_happened BOOLEAN NOT NULL,
      host_present BOOLEAN NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT attendance_report_event_reporter_unique UNIQUE (event_id, reporter_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS attendance_reports_event_idx ON attendance_reports(event_id)`;

  // Inbox notifications — sibling of notification_log. Each row is one thing
  // the user should be aware of, with denormalized title/url for fast render
  // and seen_at for read state. event_id is nullable so future system-level
  // notifications (e.g., welcome, push-permission-restored) can land here.
  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      actor_id TEXT,
      actor_name TEXT,
      title TEXT NOT NULL,
      body TEXT,
      url TEXT NOT NULL,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      seen_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS notifications_user_recent_idx ON notifications(user_id, created_at DESC)`;

  // Liminal Marketplace — public submissions for the biweekly Saturday sessions.
  // Anyone can submit (auth optional); admin reviews via /admin.
  await sql`
    CREATE TABLE IF NOT EXISTS marketplace_submissions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phase TEXT NOT NULL,
      title TEXT NOT NULL,
      pitch TEXT NOT NULL,
      problem TEXT,
      audience TEXT,
      angle TEXT,
      takeaway TEXT,
      mvp TEXT,
      sharpened_pitch TEXT,
      materials_url TEXT,
      material_files JSONB,
      links TEXT,
      target_session_date DATE,
      submitter_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Idempotent column adds for tables that already exist from the earlier migration.
  await sql`ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS problem TEXT`;
  await sql`ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS audience TEXT`;
  await sql`ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS angle TEXT`;
  await sql`ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS takeaway TEXT`;
  await sql`ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS mvp TEXT`;
  await sql`ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS sharpened_pitch TEXT`;
  await sql`ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS materials_url TEXT`;
  await sql`ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS material_files JSONB`;
  await sql`ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS image_url TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS marketplace_submissions_status_idx ON marketplace_submissions(status, created_at DESC)`;

  return { success: true, message: 'Migrations complete' };
}
