import { NextResponse } from 'next/server';
import { fetchGoogleCalendarEvents, getUpcomingGoogleEvents, getGoogleEvent } from '@/lib/google-calendar';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const upcoming = searchParams.get('upcoming') === 'true';
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const eventId = searchParams.get('eventId');

  try {
    // Fetch single event by ID
    if (eventId) {
      const event = await getGoogleEvent(eventId);
      if (!event) {
        return NextResponse.json(
          { success: false, error: 'Event not found', event: null },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        event,
        source: 'google',
        fetchedAt: new Date().toISOString(),
      });
    }

    // Fetch multiple events
    const events = upcoming
      ? await getUpcomingGoogleEvents(limit)
      : await fetchGoogleCalendarEvents();

    return NextResponse.json({
      success: true,
      events,
      source: 'google',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Google Calendar API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch Google Calendar events',
        events: [],
      },
      { status: 500 }
    );
  }
}
