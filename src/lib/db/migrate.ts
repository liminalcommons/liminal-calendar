import postgres from 'postgres';
import { describeDatabaseTarget, resolveMigrationDatabaseUrl } from './url';

export interface MigrationFailure {
  /** Truncated, whitespace-collapsed SQL so the report stays readable. */
  statement: string;
  error: string;
}

export interface MigrationResult {
  success: boolean;
  message: string;
  failures: MigrationFailure[];
  /** `host:port/database` the DDL was applied to. Never includes credentials. */
  target?: string;
  /** Which env var supplied the connection string. */
  targetSource?: string;
  /** Present when a stale non-pooling URL was ignored — see lib/db/url.ts. */
  warning?: string;
}

/**
 * Run database migrations — creates tables if they don't exist.
 * Uses raw SQL since Drizzle Kit push/migrate requires CLI or node adapter.
 *
 * Idempotent — every CREATE / ALTER uses IF NOT EXISTS or DO-block guards.
 * Safe to call against either a fresh DB (bootstraps everything) or a
 * partially-migrated DB (skips already-present objects).
 *
 * Statements are also INDEPENDENT: see `step` in runMigrationsInner.
 */
export async function runMigrations(): Promise<MigrationResult> {
  // Resolution is shared with the app (lib/db/url.ts) so DDL can never land in
  // a different database than the one being read. A direct/non-pooling URL is
  // still preferred for DDL, but only when it names the same database.
  const target = resolveMigrationDatabaseUrl();
  if (target.ignoredNonPooling) {
    console.error('[migrate] ignoring stale connection string:', target.ignoredNonPooling.reason);
  }

  const sql = postgres(target.url, {
    ssl: 'require',
    max: 1,
    connect_timeout: 10,
    prepare: false,
  });
  try {
    const result = await runMigrationsInner(sql);
    return {
      ...result,
      target: describeDatabaseTarget(target.url),
      targetSource: target.source,
      ...(target.ignoredNonPooling ? { warning: target.ignoredNonPooling.reason } : {}),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runMigrationsInner(sql: any): Promise<MigrationResult> {
  const failures: MigrationFailure[] = [];

  // Every DDL statement below runs INDEPENDENTLY: a failure is recorded and
  // the run continues to the next statement.
  //
  // Previously these were bare `await sql\`...\`` calls, so the first throw
  // aborted every statement after it. That is not hypothetical — several
  // statements here add UNIQUE constraints/indexes (members_handle_key,
  // members_clerk_id_key, members_logto_id_unique, members_feed_token_key,
  // events_booking_owner_starts_unique) which throw against live data that
  // already contains duplicates. Anything declared after the first such
  // failure silently never got created, and because the only caller
  // (instrumentation-node) just console.error's the rejection, production
  // looked healthy while missing tables. That is how `analytics_events`
  // (declared 2/3 of the way down this file) went missing in production
  // while every older table was fine — the admin analytics dashboard had
  // nothing to read and no way to say so.
  //
  // Results are unused for every statement here (all DDL), so resolving a
  // failed step to null is safe.
  const step = (strings: TemplateStringsArray, ...values: unknown[]) =>
    sql(strings, ...values).catch((err: unknown) => {
      failures.push({
        statement: strings.join(' ? ').replace(/\s+/g, ' ').trim().slice(0, 160),
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });

  // Create events table
  await step`
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Create rsvps table
  await step`
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
  await step`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add timezone and availability columns to members (idempotent)
  await step`ALTER TABLE members ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'`;
  await step`ALTER TABLE members ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT '[]'`;

  // Clerk identity column — nullable so existing identity-less rows are
  // unaffected.
  await step`ALTER TABLE members ADD COLUMN IF NOT EXISTS clerk_id TEXT`;

  // Handle — optional public-facing username, unique when present.
  await step`ALTER TABLE members ADD COLUMN IF NOT EXISTS handle TEXT`;
  await step`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'members_handle_key'
          AND conrelid = 'members'::regclass
      ) THEN
        ALTER TABLE members
          ADD CONSTRAINT members_handle_key UNIQUE (handle);
      END IF;
    END $$
  `;

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
  await step`
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
  await step`DROP INDEX IF EXISTS idx_members_clerk_id_unique`;

  // Newsletter opt-in list — populated from RSVP, signup, or admin actions.
  // Independent of members table so non-member visitors can subscribe.
  await step`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Suppression marker for unsubscribes (added after initial table creation).
  await step`ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ`;

  // Logto identity column. First Logto signin attaches logto_id to an
  // existing row by email match, or creates a new Logto-only row.
  await step`ALTER TABLE members ADD COLUMN IF NOT EXISTS logto_id TEXT`;
  await step`
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
  await step`CREATE INDEX IF NOT EXISTS idx_members_logto_id ON members(logto_id)`;

  // Create indexes for common queries
  await step`CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at)`;
  await step`CREATE INDEX IF NOT EXISTS idx_events_creator_id ON events(creator_id)`;
  await step`CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id)`;
  await step`CREATE INDEX IF NOT EXISTS idx_rsvps_user_id ON rsvps(user_id)`;

  // Event comments — flat list, soft-deletable. See
  // src/lib/db/migrations/event-comments-reports.sql for the canonical
  // statement; this is the runtime mirror so /api/db-migrate is one call.
  await step`
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
  await step`CREATE INDEX IF NOT EXISTS event_comments_event_idx ON event_comments(event_id, created_at)`;

  // Post-event attendance reports — one row per (event, reporter), upsert.
  await step`
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
  await step`CREATE INDEX IF NOT EXISTS attendance_reports_event_idx ON attendance_reports(event_id)`;

  // Inbox notifications — sibling of notification_log. Each row is one thing
  // the user should be aware of, with denormalized title/url for fast render
  // and seen_at for read state. event_id is nullable so future system-level
  // notifications (e.g., welcome, push-permission-restored) can land here.
  await step`
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
  await step`CREATE INDEX IF NOT EXISTS notifications_user_recent_idx ON notifications(user_id, created_at DESC)`;

  // Show & Tell Topic submissions — TED-style 10-min presentations submitted
  // for the biweekly hour. Host triages via /admin?tab=topics. See
  // src/lib/db/schema.ts for the canonical Drizzle definition.
  await step`
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
  await step`ALTER TABLE topic_submissions ADD COLUMN IF NOT EXISTS consent_youtube BOOLEAN NOT NULL DEFAULT FALSE`;
  await step`ALTER TABLE topic_submissions ADD COLUMN IF NOT EXISTS consent_telegram BOOLEAN NOT NULL DEFAULT FALSE`;
  await step`ALTER TABLE topic_submissions ADD COLUMN IF NOT EXISTS consent_facebook BOOLEAN NOT NULL DEFAULT FALSE`;
  await step`CREATE INDEX IF NOT EXISTS topic_submissions_status_created_idx ON topic_submissions(status, created_at DESC)`;

  // Columns historically added by prior migrations; bootstrap path
  // (CREATE TABLE above) doesn't include them, so a fresh DB needs them
  // added before the unique index below can reference them.
  await step`ALTER TABLE events ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL`;
  await step`ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'`;
  await step`ALTER TABLE events ADD COLUMN IF NOT EXISTS source_event_type_id INTEGER`;
  await step`ALTER TABLE members ADD COLUMN IF NOT EXISTS feed_token TEXT`;
  await step`ALTER TABLE members ADD COLUMN IF NOT EXISTS nudged_at TIMESTAMPTZ`;
  await step`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'members_feed_token_key'
          AND conrelid = 'members'::regclass
      ) THEN
        ALTER TABLE members
          ADD CONSTRAINT members_feed_token_key UNIQUE (feed_token);
      END IF;
    END $$
  `;

  // Booking-event race guard. Without this, two simultaneous POST /book
  // calls for the same slot can both pass the application-layer
  // computeSlots() re-validation (neither has inserted yet) and create
  // duplicate events at the same (owner, time). The partial predicate
  // limits the constraint to booking-source events only — manually
  // created events at coincident times are still allowed.
  await step`
    CREATE UNIQUE INDEX IF NOT EXISTS events_booking_owner_starts_unique
      ON events (member_id, starts_at)
      WHERE source_event_type_id IS NOT NULL
  `;

  // Web Push subscriptions. One row per (user, endpoint) — same user can
  // subscribe from multiple devices/browsers.
  await step`
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

  await step`
    CREATE TABLE IF NOT EXISTS event_mutes (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(member_id, event_id)
    )
  `;
  await step`CREATE INDEX IF NOT EXISTS event_mutes_member_idx ON event_mutes(member_id)`;

  // First-party analytics events — pageviews, guest entries, and CTA clicks.
  // See src/lib/db/schema.ts for the canonical Drizzle definition. Written by
  // the public /api/analytics/collect beacon and the /guest route; read by the
  // admin analytics dashboard.
  await step`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      path TEXT,
      target TEXT,
      visitor_id TEXT,
      is_guest BOOLEAN NOT NULL DEFAULT FALSE,
      member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await step`CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx ON analytics_events(type, created_at)`;
  await step`CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events(created_at)`;

  // Booking note + cancellation lifecycle. Note from booker travels with
  // the event forever (visible in emails + event detail). Cancellation
  // is soft — cancelled_at IS NULL means active. cancelled_by_member_id
  // is the actor (host or booker, either can cancel). The slot engine
  // filters cancelled_at IS NULL so cancelled slots return to the host's
  // availability immediately.
  await step`ALTER TABLE events ADD COLUMN IF NOT EXISTS note_from_booker TEXT`;
  await step`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`;
  await step`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_by_member_id INTEGER`;
  await step`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`;
  await step`
    DO $$ BEGIN
      ALTER TABLE events
        ADD CONSTRAINT events_cancelled_by_member_id_fkey
        FOREIGN KEY (cancelled_by_member_id) REFERENCES members(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `;

  await step`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL`;
  await step`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS remind_me BOOLEAN DEFAULT FALSE`;
  await step`ALTER TABLE event_comments ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL`;
  await step`ALTER TABLE attendance_reports ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL`;
  await step`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE CASCADE`;
  await step`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL`;
  await step`ALTER TABLE topic_submissions ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL`;

  await step`
    CREATE TABLE IF NOT EXISTS notification_log (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT notification_log_unique UNIQUE (event_id, user_id, type)
    )
  `;

  await step`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
      push_1h BOOLEAN NOT NULL DEFAULT TRUE,
      push_15min BOOLEAN NOT NULL DEFAULT TRUE,
      push_at_start BOOLEAN NOT NULL DEFAULT TRUE,
      email_24h BOOLEAN NOT NULL DEFAULT FALSE,
      email_1h BOOLEAN NOT NULL DEFAULT FALSE,
      email_15min BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await step`
    CREATE TABLE IF NOT EXISTS event_types (
      id SERIAL PRIMARY KEY,
      owner_id TEXT NOT NULL,
      owner_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER NOT NULL,
      location_kind TEXT NOT NULL,
      location_value TEXT,
      buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
      buffer_after_minutes INTEGER NOT NULL DEFAULT 0,
      min_notice_minutes INTEGER NOT NULL DEFAULT 60,
      max_days_ahead INTEGER NOT NULL DEFAULT 30,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT event_types_owner_slug_unique UNIQUE (owner_id, slug)
    )
  `;

  await step`
    CREATE TABLE IF NOT EXISTS bookable_windows (
      id SERIAL PRIMARY KEY,
      owner_id TEXT NOT NULL,
      owner_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      day_of_week INTEGER NOT NULL,
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL,
      timezone TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await step`
    CREATE TABLE IF NOT EXISTS event_invitations (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      invitee_user_id TEXT NOT NULL,
      member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      invitee_name TEXT NOT NULL,
      invitee_image TEXT,
      invited_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT event_invitations_event_invitee_unique UNIQUE (event_id, invitee_user_id)
    )
  `;

  // The legacy single-identity CHECK constraint is dropped because rows may
  // now legitimately carry only an email (no clerk/logto id) — e.g. members
  // pending re-signup. IF EXISTS keeps this idempotent.
  await step`ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_members_identity`;

  return {
    // `success` now means "every statement applied", not "the run finished".
    // A partial run still leaves the schema as complete as it can be, but the
    // caller must be able to tell the difference — see /api/db-migrate and the
    // admin analytics health panel.
    success: failures.length === 0,
    message:
      failures.length === 0
        ? 'Migrations complete'
        : `Migrations completed with ${failures.length} failed statement(s)`,
    failures,
  };
}
