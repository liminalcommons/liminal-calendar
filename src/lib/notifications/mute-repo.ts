import { and, eq } from 'drizzle-orm';
import { eventMutes, type EventMute } from '@/lib/db/schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function muteSeries(db: any, memberId: number, eventId: number): Promise<void> {
  await db
    .insert(eventMutes)
    .values({ memberId, eventId })
    .onConflictDoNothing();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function unmuteSeries(db: any, memberId: number, eventId: number): Promise<void> {
  await db
    .delete(eventMutes)
    .where(and(eq(eventMutes.memberId, memberId), eq(eventMutes.eventId, eventId)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isSeriesMuted(db: any, memberId: number, eventId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(eventMutes)
    .where(and(eq(eventMutes.memberId, memberId), eq(eventMutes.eventId, eventId)));
  return rows.length > 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMutedSeries(db: any, memberId: number): Promise<EventMute[]> {
  return await db
    .select()
    .from(eventMutes)
    .where(eq(eventMutes.memberId, memberId));
}
