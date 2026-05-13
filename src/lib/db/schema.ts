import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  unique,
  index,
  jsonb,
  date,
} from 'drizzle-orm/pg-core';

// `members` is declared first because every other person-bearing table
// FK-references it via `member_id`. Putting it at the top eliminates the
// forward-reference dance that Drizzle would otherwise require.
export const members = pgTable('members', {
  id: serial('id').primaryKey(),
  // Hylo user id — now nullable. Clerk-only Members have null hyloId.
  // The UNIQUE constraint still prevents duplicate non-null hyloIds.
  // Invariant (enforced by app layer until S6 adds a CHECK constraint):
  // at least one of (hyloId, clerkId) must be non-null on every row.
  hyloId: text('hylo_id').unique(),
  // Clerk user id — nullable. Hylo-only Members have null clerkId.
  // S6 will allow same row to carry both (account linking).
  clerkId: text('clerk_id').unique(),
  // Logto user id (subject claim from Castalia/Logto JWT). Nullable.
  // First Logto signin attaches this to an existing row by email
  // match, or creates a new Logto-only row. CHECK constraint
  // `chk_members_identity` requires at least one of (hyloId, clerkId,
  // logtoId) per row.
  logtoId: text('logto_id').unique(),
  name: text('name').notNull(),
  email: text('email'),
  handle: text('handle').unique(),
  image: text('image'),
  role: text('role').notNull().default('member'), // 'member' | 'host' | 'admin'
  timezone: text('timezone').default('UTC'),
  availability: text('availability').default('[]'), // JSON array of UTC slot indices 0-335
  feedToken: text('feed_token').unique(), // Per-user ICS subscription token
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  timezone: text('timezone').default('UTC'),
  location: text('location'),
  imageUrl: text('image_url'),
  recurrenceRule: text('recurrence_rule'), // 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null
  // Legacy provider-string id (hyloId or clerkId). Phase 4 will drop this.
  creatorId: text('creator_id').notNull(),
  // Canonical creator FK (Phase 1 backfilled, Phase 2 dual-writes,
  // Phase 3 reads, Phase 4 makes notNull and drops creator_id).
  memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
  creatorName: text('creator_name').notNull(),
  creatorImage: text('creator_image'),
  hyloGroupId: text('hylo_group_id'),
  hyloPostId: text('hylo_post_id'),
  visibility: text('visibility').notNull().default('public'),
  sourceEventTypeId: integer('source_event_type_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const rsvps = pgTable(
  'rsvps',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(), // legacy: hyloId or clerkId
    memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
    userName: text('user_name').notNull(),
    userImage: text('user_image'),
    status: text('status').notNull(), // 'yes' | 'interested' | 'no'
    // Vestigial as of the global-preferences slice (2026-05-02).
    // Cron read-path no longer reads this column; defaulted TRUE on writes.
    // Re-activated as a per-instance override hook when follow-up B ships.
    remindMe: boolean('remind_me').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('rsvps_event_user_unique').on(table.eventId, table.userId)],
);

export const notificationLog = pgTable(
  'notification_log',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // '24hr' | '1hr' | '15min'
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique('notification_log_unique').on(table.eventId, table.userId, table.type),
  ],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('push_sub_user_endpoint').on(table.userId, table.endpoint)],
);

// Per-user notification preferences. Replaces per-RSVP `rsvps.remindMe`
// as the cron read-path gate. One row per user, lazily inserted with
// defaults the first time the user (or cron) reads their preferences.
// Defaults: push columns TRUE, email columns FALSE — push is primary,
// email is opt-in.
export const notificationPreferences = pgTable('notification_preferences', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().unique(), // Hylo user id OR Clerk user id (matches rsvps.user_id pattern)
  memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }),
  pushOneHour: boolean('push_1h').notNull().default(true),
  pushFifteenMin: boolean('push_15min').notNull().default(true),
  pushAtStart: boolean('push_at_start').notNull().default(true),
  emailTwentyFourHour: boolean('email_24h').notNull().default(false),
  emailOneHour: boolean('email_1h').notNull().default(false),
  emailFifteenMin: boolean('email_15min').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Email opt-in list. Populated from RSVP form (source='rsvp'),
// signup flow (source='signup'), or admin actions (source='manual').
// Drives the monthly newsletter and is independent of the members
// table — non-member visitors who RSVP can subscribe without being
// auth'd. Email stored lowercase for case-insensitive uniqueness.
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  source: text('source').notNull(), // 'rsvp' | 'signup' | 'manual'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type NewNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;

// Member-authored comments on events. Flat list (no threading).
// `deleted_at` enables soft-delete: hides from feed but keeps the row so an
// admin audit trail and any future replies remain anchored.
export const eventComments = pgTable('event_comments', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(), // hyloId or clerkId — same convention as rsvps.userId
  memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
  authorName: text('author_name').notNull(),
  authorImage: text('author_image'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Post-event attendance reports. One row per (event, reporter). Upserted on
// resubmission. Allowed only after the event has ended (enforced by API).
export const attendanceReports = pgTable(
  'attendance_reports',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    reporterId: text('reporter_id').notNull(),
    memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
    reporterName: text('reporter_name').notNull(),
    eventHappened: boolean('event_happened').notNull(),
    hostPresent: boolean('host_present').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('attendance_report_event_reporter_unique').on(table.eventId, table.reporterId),
  ],
);

export type EventComment = typeof eventComments.$inferSelect;
export type NewEventComment = typeof eventComments.$inferInsert;
export type AttendanceReport = typeof attendanceReports.$inferSelect;
export type NewAttendanceReport = typeof attendanceReports.$inferInsert;

// Inbox notifications. Sibling of `notificationLog` (which exists purely for
// cron-side dedupe of channel deliveries). This table is the source of truth
// for "user U should know that thing T happened" — it has actor context,
// denormalized title/url for fast read-path rendering, structured payload for
// future re-rendering, and per-row seen state. One inbox row may correspond
// to zero, one, or many `notificationLog` rows depending on which channels
// (push, email) the dispatch hit; the relationship is intentionally implicit.
//
// Type taxonomy (string, dot-separated):
//   reminder.24hr | reminder.1hr | reminder.15min | reminder.start
//   post-event.prompt
//   event.changed | event.cancelled
//   attendance.negative
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(), // recipient (hyloId or clerkId)
    memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    eventId: integer('event_id').references(() => events.id, { onDelete: 'cascade' }),
    actorId: text('actor_id'), // who caused it; null for cron/system triggers
    actorMemberId: integer('actor_member_id').references(() => members.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    title: text('title').notNull(), // ready-to-render headline
    body: text('body'), // optional secondary line
    url: text('url').notNull(), // tap target (typically /events/{id} with optional anchor)
    payload: jsonb('payload'), // type-specific structured context
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }), // null = unread
  },
  (table) => [
    index('notifications_user_recent_idx').on(table.userId, table.createdAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferences = typeof notificationPreferences.$inferInsert;

export const eventTypes = pgTable(
  'event_types',
  {
    id: serial('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    ownerMemberId: integer('owner_member_id').references(() => members.id, { onDelete: 'set null' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    locationKind: text('location_kind').notNull(),
    locationValue: text('location_value'),
    bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
    bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
    minNoticeMinutes: integer('min_notice_minutes').notNull().default(60),
    maxDaysAhead: integer('max_days_ahead').notNull().default(30),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('event_types_owner_slug_unique').on(table.ownerId, table.slug)],
);

export const bookableWindows = pgTable('bookable_windows', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  ownerMemberId: integer('owner_member_id').references(() => members.id, { onDelete: 'set null' }),
  dayOfWeek: integer('day_of_week').notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
  timezone: text('timezone').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const eventInvitations = pgTable(
  'event_invitations',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    inviteeUserId: text('invitee_user_id').notNull(),
    memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
    inviteeName: text('invitee_name').notNull(),
    inviteeImage: text('invitee_image'),
    invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('event_invitations_event_invitee_unique').on(table.eventId, table.inviteeUserId)],
);

// Show & Tell Topic submissions. A Topic is a TED-style 10-minute presentation
// for the biweekly Show & Tell hour. Submitters propose; host triages.
// `targetSessionDate` is set by the host when scheduled into a specific session.
export const topicSubmissions = pgTable('topic_submissions', {
  id: serial('id').primaryKey(),
  submitterId: text('submitter_id').notNull(), // hyloId | clerkId | logtoId
  memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
  submitterName: text('submitter_name').notNull(),
  submitterEmail: text('submitter_email'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  formatHint: text('format_hint'), // 'demo' | 'insight' | 'question' | 'other' | null
  materialsUrl: text('materials_url'),
  imageUrl: text('image_url'),
  // Internal scaffolding from the AI host conversation — kept for triage context.
  hook: text('hook'),
  audience: text('audience'),
  takeaway: text('takeaway'),
  status: text('status').notNull().default('submitted'), // 'submitted' | 'accepted' | 'declined'
  targetSessionDate: date('target_session_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type TopicSubmission = typeof topicSubmissions.$inferSelect;
export type NewTopicSubmission = typeof topicSubmissions.$inferInsert;

// Type helpers
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Rsvp = typeof rsvps.$inferSelect;
export type NewRsvp = typeof rsvps.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export const eventMutes = pgTable(
  'event_mutes',
  {
    id: serial('id').primaryKey(),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('event_mutes_member_event_unique').on(table.memberId, table.eventId)],
);
export type EventMute = typeof eventMutes.$inferSelect;
