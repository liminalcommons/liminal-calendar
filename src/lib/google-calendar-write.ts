// Google Calendar Write Service - OAuth2 based
// For syncing community events TO Google Calendar

import { supabase } from './supabase';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'calendar@liminalcommons.com';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

// Token storage interface
interface GoogleAuthTokens {
  user_id: string;
  user_email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
}

// Generate OAuth URL for admin to authorize
export function getGoogleAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // Force consent to get refresh token
    ...(state && { state }),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

// Refresh access token using refresh token
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json();
}

// Get user email from access token
export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  const data = await response.json();
  return data.email;
}

// Store tokens in Supabase
export async function storeGoogleTokens(
  userId: string,
  email: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { error } = await supabase
    .from('google_auth')
    .upsert({
      user_id: userId,
      user_email: email,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expiry: tokenExpiry,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    throw new Error(`Failed to store tokens: ${error.message}`);
  }
}

// Get valid access token (refreshes if expired)
export async function getValidAccessToken(): Promise<string | null> {
  // Get stored tokens (any admin who has authorized)
  const { data: authData, error } = await supabase
    .from('google_auth')
    .select('*')
    .limit(1)
    .single();

  if (error || !authData) {
    console.log('No Google auth tokens found - admin needs to authorize');
    return null;
  }

  const tokens = authData as GoogleAuthTokens;
  const expiry = new Date(tokens.token_expiry);
  const now = new Date();

  // If token expires in less than 5 minutes, refresh it
  if (expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token);

      // Update stored tokens
      await supabase
        .from('google_auth')
        .update({
          access_token: refreshed.access_token,
          token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', tokens.user_id);

      return refreshed.access_token;
    } catch (err) {
      console.error('Failed to refresh token:', err);
      return null;
    }
  }

  return tokens.access_token;
}

// Create event on Google Calendar
export async function createGoogleCalendarEvent(event: {
  title: string;
  description?: string;
  starts_at: string;
  ends_at?: string;
  event_url?: string;
}): Promise<string | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    console.log('No valid access token - skipping Google Calendar sync');
    return null;
  }

  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at ? new Date(event.ends_at) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour

  const googleEvent = {
    summary: event.title,
    description: event.description
      ? `${event.description}${event.event_url ? `\n\nJoin: ${event.event_url}` : ''}`
      : event.event_url ? `Join: ${event.event_url}` : undefined,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: 'UTC',
    },
    // Add event URL as conference data if it's a meeting link
    ...(event.event_url && {
      conferenceData: {
        entryPoints: [{
          entryPointType: 'video',
          uri: event.event_url,
          label: 'Join Meeting',
        }],
        conferenceSolution: {
          key: { type: 'addOn' },
          name: 'Meeting Link',
        },
      },
    }),
  };

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events?conferenceDataVersion=1`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(googleEvent),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to create Google Calendar event:', error);
    return null;
  }

  const created = await response.json();
  return created.id; // Return Google event ID for tracking
}

// Update event on Google Calendar
export async function updateGoogleCalendarEvent(
  googleEventId: string,
  event: {
    title: string;
    description?: string;
    starts_at: string;
    ends_at?: string;
    event_url?: string;
  }
): Promise<boolean> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return false;
  }

  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at ? new Date(event.ends_at) : new Date(startDate.getTime() + 60 * 60 * 1000);

  const googleEvent = {
    summary: event.title,
    description: event.description
      ? `${event.description}${event.event_url ? `\n\nJoin: ${event.event_url}` : ''}`
      : event.event_url ? `Join: ${event.event_url}` : undefined,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: 'UTC',
    },
  };

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events/${googleEventId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(googleEvent),
    }
  );

  return response.ok;
}

// Delete event from Google Calendar
export async function deleteGoogleCalendarEvent(googleEventId: string): Promise<boolean> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return false;
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events/${googleEventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return response.ok || response.status === 404; // 404 means already deleted
}

// Check if Google Calendar sync is configured
export async function isGoogleCalendarSyncEnabled(): Promise<boolean> {
  const accessToken = await getValidAccessToken();
  return accessToken !== null;
}
