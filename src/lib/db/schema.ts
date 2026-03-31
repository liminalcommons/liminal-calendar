import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('rsvps_event_user_unique').on(table.eventId, table.userId)],
);

// Type helpers
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Rsvp = typeof rsvps.$inferSelect;
export type NewRsvp = typeof rsvps.$inferInsert;
