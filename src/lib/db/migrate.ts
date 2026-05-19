import postgres from 'postgres';

/**
 * Run database migrations — creates tables if they don't exist.
 * Uses raw SQL since Drizzle Kit push/migrate requires CLI or node adapter.
 *
 * Idempotent — every CREATE / ALTER uses IF NOT EXISTS or DO-block guards.
 * Safe to call against either a fresh DB (bootstraps everything) or a
 * partially-migrated DB (skips already-present objects).
 */
export async function runMigrations() {
  const url =
    process.env.DATABASE_URL ||
    process.env.calender_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.calender_POSTGRES_URL;
  if (!url) throw new Error('No database URL found');
  const sql = postgres(url, { ssl: 'require', max: 1, connect_timeout: 10 });
  try {
    return await runMigrationsInner(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runMigrationsInner(sql: any) {

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

  // Show & Tell Topic submissions — TED-style 10-min presentations submitted
  // for the biweekly hour. Host triages via /admin?tab=topics. See
  // src/lib/db/schema.ts for the canonical Drizzle definition.
  await sql`
    CREATE TABLE IF NOT EXISTS topic_submissions (
      id SERIAL PRIMARY KEY,
      submitter_id TEXT NOT NULL,
      member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      submitter_name TEXT NOT NULL,
      submitter_email TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      format_hint TEXT,
      materials_url TEXT,
      image_url TEXT,
      hook TEXT,
      audience TEXT,
      takeaway TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      target_session_date DATE,
      consent_youtube BOOLEAN NOT NULL DEFAULT FALSE,
      consent_telegram BOOLEAN NOT NULL DEFAULT FALSE,
      consent_facebook BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE topic_submissions ADD COLUMN IF NOT EXISTS consent_youtube BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE topic_submissions ADD COLUMN IF NOT EXISTS consent_telegram BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE topic_submissions ADD COLUMN IF NOT EXISTS consent_facebook BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`CREATE INDEX IF NOT EXISTS topic_submissions_status_created_idx ON topic_submissions(status, created_at DESC)`;

  // Booking-event race guard. Without this, two simultaneous POST /book
  // calls for the same slot can both pass the application-layer
  // computeSlots() re-validation (neither has inserted yet) and create
  // duplicate events at the same (owner, time). The partial predicate
  // limits the constraint to booking-source events only — manually
  // created events at coincident times are still allowed.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS events_booking_owner_starts_unique
      ON events (member_id, starts_at)
      WHERE source_event_type_id IS NOT NULL
  `;

  // Web Push subscriptions. One row per (user, endpoint) — same user can
  // subscribe from multiple devices/browsers.
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT push_sub_user_endpoint UNIQUE (user_id, endpoint)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS event_mutes (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(member_id, event_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS event_mutes_member_idx ON event_mutes(member_id)`;

  // Booking note + cancellation lifecycle. Note from booker travels with
  // the event forever (visible in emails + event detail). Cancellation
  // is soft — cancelled_at IS NULL means active. cancelled_by_member_id
  // is the actor (host or booker, either can cancel). The slot engine
  // filters cancelled_at IS NULL so cancelled slots return to the host's
  // availability immediately.
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS note_from_booker TEXT`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_by_member_id INTEGER`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`;
  await sql`
    DO $$ BEGIN
      ALTER TABLE events
        ADD CONSTRAINT events_cancelled_by_member_id_fkey
        FOREIGN KEY (cancelled_by_member_id) REFERENCES members(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `;

  return { success: true, message: 'Migrations complete' };
}
