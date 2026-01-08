import ICAL from 'ical.js';

const ICAL_URL = 'https://calendar.google.com/calendar/ical/calendar%40liminalcommons.com/public/basic.ics';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const EXPANSION_MONTHS = 3; // How many months ahead to expand recurring events

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  event_url: string | null;
  location: string | null;
  source: 'google';
  isRecurring?: boolean;
}

// Simple in-memory cache
let cache: {
  events: GoogleCalendarEvent[];
  timestamp: number;
} | null = null;

// Helper to create URL-safe event ID (avoid @ : . in URLs)
function makeUrlSafeId(uid: string, timestamp?: Date): string {
  // Replace special characters that cause URL encoding issues
  const safeUid = uid.replace(/@/g, '_at_').replace(/\./g, '_').replace(/:/g, '-');
  if (timestamp) {
    // Use epoch ms for recurring events to ensure uniqueness and URL safety
    return `google-${safeUid}-${timestamp.getTime()}`;
  }
  return `google-${safeUid}`;
}

// Helper to extract URL from description or location
function extractEventUrl(description: string | null, location: string | null): string | null {
  let eventUrl: string | null = null;

  // Try to find URLs in the description
  if (description) {
    const urlMatch = description.match(/https?:\/\/[^\s<>"{}|\^`[\]]+/);
    if (urlMatch) {
      eventUrl = urlMatch[0];
    }
  }

  // Check for location field which might contain meeting URL
  if (!eventUrl && location && location.startsWith('http')) {
    eventUrl = location;
  }

  return eventUrl;
}

// Expand a recurring event into individual occurrences
function expandRecurringEvent(
  event: ICAL.Event,
  rangeStart: ICAL.Time,
  rangeEnd: ICAL.Time
): GoogleCalendarEvent[] {
  const events: GoogleCalendarEvent[] = [];
  const description = event.description || null;
  const location = event.location || null;
  const eventUrl = extractEventUrl(description, location);

  // Calculate event duration for computing end times
  const duration = event.endDate
    ? event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime()
    : 60 * 60 * 1000; // Default 1 hour if no end date

  try {
    // Use the event iterator to get all occurrences
    const iterator = event.iterator();
    let occurrence = iterator.next();
    let count = 0;
    const maxOccurrences = 100; // Safety limit

    while (occurrence && count < maxOccurrences) {
      // Check if occurrence is past our end range
      if (occurrence.compare(rangeEnd) > 0) {
        break;
      }

      // Only include occurrences within our range
      if (occurrence.compare(rangeStart) >= 0) {
        const startDate = occurrence.toJSDate();
        const endDate = new Date(startDate.getTime() + duration);

        events.push({
          id: makeUrlSafeId(event.uid, startDate),
          title: event.summary || 'Untitled Event',
          description,
          starts_at: startDate.toISOString(),
          ends_at: endDate.toISOString(),
          event_url: eventUrl,
          location,
          source: 'google' as const,
          isRecurring: true,
        });
      }

      occurrence = iterator.next();
      count++;
    }
  } catch (error) {
    console.error('Error expanding recurring event:', event.summary, error);
  }

  return events;
}

function parseICS(icsData: string): GoogleCalendarEvent[] {
  try {
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    // Define the range for recurring event expansion
    const now = new Date();
    const rangeStart = ICAL.Time.fromJSDate(now, false);
    const rangeEnd = ICAL.Time.fromJSDate(
      new Date(now.getTime() + EXPANSION_MONTHS * 30 * 24 * 60 * 60 * 1000),
      false
    );

    const events: GoogleCalendarEvent[] = [];

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);

      // Check if this is a recurring event
      const rrule = vevent.getFirstPropertyValue('rrule');

      if (rrule) {
        // Expand recurring event into individual occurrences
        const expandedEvents = expandRecurringEvent(event, rangeStart, rangeEnd);
        events.push(...expandedEvents);
      } else {
        // Single event - add directly
        const description = event.description || null;
        const location = event.location || null;
        const eventUrl = extractEventUrl(description, location);

        events.push({
          id: makeUrlSafeId(event.uid),
          title: event.summary || 'Untitled Event',
          description,
          starts_at: event.startDate.toJSDate().toISOString(),
          ends_at: event.endDate ? event.endDate.toJSDate().toISOString() : null,
          event_url: eventUrl,
          location,
          source: 'google' as const,
          isRecurring: false,
        });
      }
    }

    // Sort by start date
    events.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

    return events;
  } catch (error) {
    console.error('Error parsing iCal data:', error);
    return [];
  }
}

export async function fetchGoogleCalendarEvents(): Promise<GoogleCalendarEvent[]> {
  // Check cache first
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.events;
  }

  try {
    const response = await fetch(ICAL_URL, {
      next: { revalidate: 300 }, // 5 minute cache on Vercel
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.status}`);
    }

    const icsData = await response.text();
    const events = parseICS(icsData);

    // Update cache
    cache = {
      events,
      timestamp: Date.now(),
    };

    return events;
  } catch (error) {
    console.error('Error fetching Google Calendar:', error);

    // Return cached data if available (stale-while-revalidate pattern)
    if (cache) {
      return cache.events;
    }

    return [];
  }
}

// Get upcoming events only (starting from now)
export async function getUpcomingGoogleEvents(limit = 10): Promise<GoogleCalendarEvent[]> {
  const events = await fetchGoogleCalendarEvents();
  const now = new Date();

  return events
    .filter(event => new Date(event.starts_at) >= now)
    .slice(0, limit);
}

// Clear the cache (useful for testing or manual refresh)
export function clearGoogleCalendarCache(): void {
  cache = null;
}

// Get a single Google event by ID
export async function getGoogleEvent(id: string): Promise<GoogleCalendarEvent | null> {
  const events = await fetchGoogleCalendarEvents();
  return events.find(event => event.id === id) || null;
}
