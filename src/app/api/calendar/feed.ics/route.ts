import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';
import { generateCalendarFeed, type ICSEvent } from '@/lib/ics-generator';
import { asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// Strip HTML tags from description for plain-text ICS
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export async function GET() {
  try {
    const allEvents = await db.select().from(events).orderBy(asc(events.startsAt));
    const displayEvents = allEvents.map((e) => dbEventToDisplayEvent(e));

    const icsEvents: (ICSEvent & { id: string })[] = displayEvents.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description ? stripHtml(e.description) : undefined,
      starts_at: e.starts_at,
      ends_at: e.ends_at ?? undefined,
      location: e.location ?? undefined,
      url: e.event_url ?? undefined,
      organizer: { name: e.creator_name },
      recurrenceRule: e.recurrenceRule,
    }));

    const icsContent = generateCalendarFeed(icsEvents);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="liminal-commons.ics"',
        'Cache-Control': 'public, max-age=900, s-maxage=900',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('ICS feed error:', err);
    return new NextResponse('Calendar feed temporarily unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain', 'Retry-After': '300' },
    });
  }
}
