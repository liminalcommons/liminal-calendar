import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-initialized singleton to avoid build-time errors
let _supabaseInstance: SupabaseClient | null = null;

function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // During build, return a mock that will throw on actual use
    // This prevents build failures while ensuring runtime safety
    throw new Error('Supabase environment variables not configured');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

// Export a proxy that lazy-initializes on first access
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_supabaseInstance) {
      _supabaseInstance = createSupabaseClient();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (_supabaseInstance as any)[prop];
    if (typeof value === 'function') {
      return value.bind(_supabaseInstance);
    }
    return value;
  },
});

// User type for presence/markers
export interface User {
  clerk_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  timezone: string;
  timezone_source: 'geolocation' | 'browser' | 'ip' | 'manual';
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertUserInput {
  clerk_id: string;
  name: string;
  email?: string;
  avatar_url?: string;
  timezone: string;
  timezone_source: 'geolocation' | 'browser' | 'ip' | 'manual';
}

// User management functions
export async function getUser(clerkId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_id', clerkId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data as User | null;
}

export async function upsertUser(input: UpsertUserInput): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        ...input,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clerk_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as User;
}

export async function updateUserLastSeen(clerkId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ last_seen: new Date().toISOString() })
    .eq('clerk_id', clerkId);

  if (error) throw error;
}

// Types for our events table
export interface CalendarEvent {
  id: string;
  creator_id: string;
  creator_name: string;
  title: string;
  description: string | null;
  event_url: string | null;
  starts_at: string; // ISO timestamp
  ends_at: string | null;
  timezone: string;
  is_golden_hour: boolean;
  status: 'scheduled' | 'cancelled';
  created_at: string;
  updated_at: string;
  google_event_id?: string | null; // For Google Calendar sync
  // New fields for upgraded calendar
  recurrence_rule?: RecurrenceRule | null;
  series_id?: string | null;
  parent_event_id?: string | null;
  visibility?: EventVisibility;
  allowed_emails?: string[] | null;
  event_type?: EventType;
}

export interface CreateEventInput {
  creator_id: string;
  creator_name: string;
  creator_image_url?: string;
  title: string;
  description?: string;
  event_url?: string;
  starts_at: string;
  ends_at?: string;
  timezone: string;
  is_golden_hour: boolean;
  // New fields for upgraded calendar
  recurrence_rule?: RecurrenceRule;
  visibility?: EventVisibility;
  allowed_emails?: string[];
  event_type?: EventType;
}

// Recurrence support
export type RecurrencePattern = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface RecurrenceRule {
  pattern: RecurrencePattern;
  interval?: number; // e.g., every 2 weeks
  endDate?: string; // ISO date when recurrence ends
  daysOfWeek?: number[]; // For custom patterns: 0=Sun, 1=Mon, etc.
}

// Visibility options
export type EventVisibility = 'public' | 'members_only' | 'invite_only';

// Event types with colors
export type EventType = 'general' | 'presentation' | 'workshop' | 'social' | 'meeting' | 'standup';

// Database operations
export async function getEvents(options?: {
  startDate?: Date;
  endDate?: Date;
  goldenHourOnly?: boolean;
}) {
  let query = supabase
    .from('events')
    .select('*')
    .eq('status', 'scheduled')
    .order('starts_at', { ascending: true });

  if (options?.startDate) {
    query = query.gte('starts_at', options.startDate.toISOString());
  }
  if (options?.endDate) {
    query = query.lte('starts_at', options.endDate.toISOString());
  }
  if (options?.goldenHourOnly) {
    query = query.eq('is_golden_hour', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as CalendarEvent[];
}

export async function getUpcomingEvents(limit = 5) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'scheduled')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data as CalendarEvent[];
}

export async function getEvent(id: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as CalendarEvent;
}

export async function createEvent(event: CreateEventInput) {
  // Prepare event data with new fields
  const eventData = {
    creator_id: event.creator_id,
    creator_name: event.creator_name,
    title: event.title,
    description: event.description,
    event_url: event.event_url,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    timezone: event.timezone,
    is_golden_hour: event.is_golden_hour,
    recurrence_rule: event.recurrence_rule || null,
    visibility: event.visibility || 'public',
    allowed_emails: event.allowed_emails || null,
    event_type: event.event_type || 'general',
  };

  const { data, error } = await supabase
    .from('events')
    .insert(eventData)
    .select()
    .single();

  if (error) throw error;

  const createdEvent = data as CalendarEvent;

  // Auto-add creator as 'going' RSVP (Phase 1: Host as Attendee)
  try {
    await supabase.from('event_rsvps').insert({
      event_id: createdEvent.id,
      event_source: 'community',
      user_id: event.creator_id,
      user_name: event.creator_name,
      user_image_url: event.creator_image_url || null,
      status: 'going',
    });
  } catch (rsvpError) {
    // Log but don't fail - RSVP is supplementary
    console.log('Auto-RSVP for creator skipped:', rsvpError instanceof Error ? rsvpError.message : 'Unknown error');
  }

  // If recurring, generate future instances
  if (event.recurrence_rule && event.recurrence_rule.pattern !== 'none') {
    try {
      await generateRecurringInstances(createdEvent, event.recurrence_rule, event.creator_image_url);
    } catch (recurrenceError) {
      console.log('Recurrence generation error:', recurrenceError instanceof Error ? recurrenceError.message : 'Unknown error');
    }
  }

  // Try to sync to Google Calendar (non-blocking)
  try {
    const { createGoogleCalendarEvent } = await import('./google-calendar-write');
    const googleEventId = await createGoogleCalendarEvent({
      title: event.title,
      description: event.description,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      event_url: event.event_url,
    });

    if (googleEventId) {
      // Update the event with the Google event ID
      await supabase
        .from('events')
        .update({ google_event_id: googleEventId })
        .eq('id', createdEvent.id);

      createdEvent.google_event_id = googleEventId;
      console.log(`Event synced to Google Calendar: ${googleEventId}`);
    }
  } catch (syncError) {
    // Log but don't fail - Google sync is optional
    console.log('Google Calendar sync skipped:', syncError instanceof Error ? syncError.message : 'Unknown error');
  }

  return createdEvent;
}

// Helper function to generate recurring event instances
async function generateRecurringInstances(
  parentEvent: CalendarEvent,
  rule: RecurrenceRule,
  creatorImageUrl?: string
): Promise<void> {
  const { generateOccurrences } = await import('./recurrence');
  const seriesId = crypto.randomUUID();

  // Update parent event with series_id
  await supabase
    .from('events')
    .update({ series_id: seriesId })
    .eq('id', parentEvent.id);

  // Generate occurrence dates (up to 12 weeks ahead)
  const occurrences = generateOccurrences(
    new Date(parentEvent.starts_at),
    rule,
    12 // max weeks
  );

  // Skip the first occurrence (that's the parent event)
  const futureOccurrences = occurrences.slice(1);

  // Create child events for each occurrence
  for (const occurrenceDate of futureOccurrences) {
    const duration = parentEvent.ends_at
      ? new Date(parentEvent.ends_at).getTime() - new Date(parentEvent.starts_at).getTime()
      : 60 * 60 * 1000; // 1 hour default

    const instanceData = {
      creator_id: parentEvent.creator_id,
      creator_name: parentEvent.creator_name,
      title: parentEvent.title,
      description: parentEvent.description,
      event_url: parentEvent.event_url,
      starts_at: occurrenceDate.toISOString(),
      ends_at: new Date(occurrenceDate.getTime() + duration).toISOString(),
      timezone: parentEvent.timezone,
      is_golden_hour: parentEvent.is_golden_hour,
      series_id: seriesId,
      parent_event_id: parentEvent.id,
      recurrence_rule: rule,
      visibility: parentEvent.visibility || 'public',
      allowed_emails: parentEvent.allowed_emails,
      event_type: parentEvent.event_type || 'general',
    };

    const { data: instanceEvent } = await supabase
      .from('events')
      .insert(instanceData)
      .select()
      .single();

    // Auto-add creator as 'going' for each instance
    if (instanceEvent) {
      await supabase.from('event_rsvps').insert({
        event_id: instanceEvent.id,
        event_source: 'community',
        user_id: parentEvent.creator_id,
        user_name: parentEvent.creator_name,
        user_image_url: creatorImageUrl || null,
        status: 'going',
      }).catch(() => {}); // Ignore errors
    }
  }
}

export async function updateEvent(id: string, updates: Partial<CreateEventInput>) {
  // First get the existing event to check for google_event_id
  const { data: existingEvent } = await supabase
    .from('events')
    .select('google_event_id, title, description, starts_at, ends_at, event_url')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('events')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  const updatedEvent = data as CalendarEvent;

  // Try to sync update to Google Calendar
  if (existingEvent?.google_event_id) {
    try {
      const { updateGoogleCalendarEvent } = await import('./google-calendar-write');
      await updateGoogleCalendarEvent(existingEvent.google_event_id, {
        title: updates.title || existingEvent.title,
        description: updates.description || existingEvent.description || undefined,
        starts_at: updates.starts_at || existingEvent.starts_at,
        ends_at: updates.ends_at || existingEvent.ends_at || undefined,
        event_url: updates.event_url || existingEvent.event_url || undefined,
      });
      console.log(`Google Calendar event updated: ${existingEvent.google_event_id}`);
    } catch (syncError) {
      console.log('Google Calendar update skipped:', syncError instanceof Error ? syncError.message : 'Unknown error');
    }
  }

  return updatedEvent;
}

export async function deleteEvent(id: string) {
  // First get the google_event_id if it exists
  const { data: existingEvent } = await supabase
    .from('events')
    .select('google_event_id')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('events')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;

  // Try to delete from Google Calendar
  if (existingEvent?.google_event_id) {
    try {
      const { deleteGoogleCalendarEvent } = await import('./google-calendar-write');
      await deleteGoogleCalendarEvent(existingEvent.google_event_id);
      console.log(`Google Calendar event deleted: ${existingEvent.google_event_id}`);
    } catch (syncError) {
      console.log('Google Calendar delete skipped:', syncError instanceof Error ? syncError.message : 'Unknown error');
    }
  }
}

// ===================
// RSVP / Commitment System
// ===================

export type RSVPStatus = 'going' | 'maybe' | 'not_going';

export interface EventRSVP {
  id: string;
  event_id: string;
  event_source: 'community' | 'google';
  user_id: string;
  user_name: string;
  user_image_url: string | null;
  status: RSVPStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateRSVPInput {
  event_id: string;
  event_source: 'community' | 'google';
  user_id: string;
  user_name: string;
  user_image_url?: string;
  status: RSVPStatus;
}

// Get all RSVPs for an event
export async function getEventRSVPs(eventId: string): Promise<EventRSVP[]> {
  const { data, error } = await supabase
    .from('event_rsvps')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as EventRSVP[];
}

// Get a user's RSVP for a specific event
export async function getUserRSVP(eventId: string, userId: string): Promise<EventRSVP | null> {
  const { data, error } = await supabase
    .from('event_rsvps')
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data as EventRSVP | null;
}

// Create or update an RSVP (upsert)
export async function upsertRSVP(rsvp: CreateRSVPInput): Promise<EventRSVP> {
  const { data, error } = await supabase
    .from('event_rsvps')
    .upsert(
      {
        ...rsvp,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'event_id,user_id',
      }
    )
    .select()
    .single();

  if (error) throw error;
  return data as EventRSVP;
}

// Remove an RSVP
export async function deleteRSVP(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('event_rsvps')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) throw error;
}

// Get RSVP counts for an event
export async function getRSVPCounts(eventId: string): Promise<{ going: number; maybe: number; not_going: number }> {
  const rsvps = await getEventRSVPs(eventId);
  return {
    going: rsvps.filter(r => r.status === 'going').length,
    maybe: rsvps.filter(r => r.status === 'maybe').length,
    not_going: rsvps.filter(r => r.status === 'not_going').length,
  };
}
