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
    remindMe: boolean('remind_me').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('rsvps_event_user_unique').on(table.eventId, table.userId)],
);

export const members = pgTable('members', {
  id: serial('id').primaryKey(),
  hyloId: text('hylo_id').notNull().unique(),
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

export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Type helpers
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Rsvp = typeof rsvps.$inferSelect;
export type NewRsvp = typeof rsvps.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
