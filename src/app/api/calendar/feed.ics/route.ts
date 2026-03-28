import { NextResponse } from 'next/server';
import { getEvents, LIMINAL_COMMONS_GROUP_ID } from '@/lib/hylo-client';
import { hyloEventToDisplayEvent } from '@/lib/display-event';
import { generateCalendarFeed, type ICSEvent } from '@/lib/ics-generator';
import { auth } from '../../../../../auth';

export const dynamic = 'force-dynamic';

// Strip HTML tags from description for plain-text ICS
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export async function GET() {
  // Try service token first, fall back to logged-in user's session
  let token = process.env.HYLO_SERVICE_TOKEN?.trim();

  if (!token) {
    const session = await auth();
    token = (session as any)?.accessToken;
  }

  if (!token) {
    return new NextResponse('Calendar feed temporarily unavailable. Sign in to preview, or set HYLO_SERVICE_TOKEN for public access.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain', 'Retry-After': '3600' },
    });
  }

  try {
    const hyloEvents = await getEvents(token, LIMINAL_COMMONS_GROUP_ID);
    const displayEvents = hyloEvents.map(hyloEventToDisplayEvent);

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
