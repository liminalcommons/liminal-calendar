import { desc, eq } from 'drizzle-orm';
import { eventMutes, events } from '@/lib/db/schema';

export interface MutedEntry {
  eventId: number;
  title: string;
  startsAt: Date;
  mutedAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMutedWithEventDetails(db: any, memberId: number): Promise<MutedEntry[]> {
  const rows = await db
    .select({
      eventId: events.id,
      title: events.title,
      startsAt: events.startsAt,
      mutedAt: eventMutes.createdAt,
    })
    .from(eventMutes)
    .innerJoin(events, eq(eventMutes.eventId, events.id))
    .where(eq(eventMutes.memberId, memberId))
    .orderBy(desc(eventMutes.createdAt));
  return rows as MutedEntry[];
}
