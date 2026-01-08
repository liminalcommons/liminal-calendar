import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
}

export interface CreateEventInput {
  creator_id: string;
  creator_name: string;
  title: string;
  description?: string;
  event_url?: string;
  starts_at: string;
  ends_at?: string;
  timezone: string;
  is_golden_hour: boolean;
}

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
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single();

  if (error) throw error;

  const createdEvent = data as CalendarEvent;

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
