import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  unique,
} from 'drizzle-orm/pg-core';

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
  creatorId: text('creator_id').notNull(), // Hylo user ID
  creatorName: text('creator_name').notNull(),
  creatorImage: text('creator_image'),
  hyloGroupId: text('hylo_group_id'),
  hyloPostId: text('hylo_post_id'),
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
    userId: text('user_id').notNull(), // Hylo user ID
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
  name: text('name').notNull(),
  email: text('email'),
  image: text('image'),
  role: text('role').notNull().default('member'), // 'member' | 'host' | 'admin'
  timezone: text('timezone').default('UTC'),
  availability: text('availability').default('[]'), // JSON array of UTC slot indices 0-335
  feedToken: text('feed_token').unique(), // Per-user ICS subscription token
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const notificationLog = pgTable(
  'notification_log',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
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

export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferences = typeof notificationPreferences.$inferInsert;

// Type helpers
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Rsvp = typeof rsvps.$inferSelect;
export type NewRsvp = typeof rsvps.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
