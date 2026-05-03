import { eq } from 'drizzle-orm';
import { notificationPreferences, type NotificationPreferences } from '@/lib/db/schema';

export const WINDOW_TO_COLUMN = {
  'push-1hr': 'pushOneHour',
  'push-15min': 'pushFifteenMin',
  'push-start': 'pushAtStart',
  '24hr': 'emailTwentyFourHour',
  '1hr': 'emailOneHour',
  '15min': 'emailFifteenMin',
} as const;

export type NotificationChannelHorizon = keyof typeof WINDOW_TO_COLUMN;
export type NotificationPreferenceColumn = (typeof WINDOW_TO_COLUMN)[NotificationChannelHorizon];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePreferences(db: any, userId: string): Promise<NotificationPreferences | null> {
  await db.insert(notificationPreferences).values({ userId }).onConflictDoNothing();
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  return rows[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPreferences(db: any, userId: string): Promise<NotificationPreferences | null> {
  return ensurePreferences(db, userId);
}

export interface PreferencesUpdate {
  pushOneHour?: boolean;
  pushFifteenMin?: boolean;
  pushAtStart?: boolean;
  emailTwentyFourHour?: boolean;
  emailOneHour?: boolean;
  emailFifteenMin?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updatePreferences(db: any, userId: string, update: PreferencesUpdate): Promise<void> {
  await ensurePreferences(db, userId);
  await db
    .update(notificationPreferences)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(notificationPreferences.userId, userId));
}
