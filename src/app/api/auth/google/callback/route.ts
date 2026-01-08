// GET /api/auth/google/callback - Handle Google OAuth callback
// Exchanges code for tokens and stores them

import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  getGoogleUserEmail,
  storeGoogleTokens,
} from '@/lib/google-calendar-write';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // Contains Clerk user ID
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    console.error('Google OAuth error:', error);
    return NextResponse.redirect(
      new URL(`/?google_auth=error&message=${encodeURIComponent(error)}`, request.url)
    );
  }

  // Verify we have the authorization code
  if (!code) {
    return NextResponse.redirect(
      new URL('/?google_auth=error&message=No%20authorization%20code', request.url)
    );
  }

  // Verify we have the user ID from state
  if (!state) {
    return NextResponse.redirect(
      new URL('/?google_auth=error&message=Invalid%20state', request.url)
    );
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user's Google email
    const email = await getGoogleUserEmail(tokens.access_token);

    // Store tokens in Supabase
    await storeGoogleTokens(
      state, // Clerk user ID
      email,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in
    );

    // Successfully connected Google Calendar

    // Redirect to home with success message
    return NextResponse.redirect(
      new URL(`/?google_auth=success&email=${encodeURIComponent(email)}`, request.url)
    );
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(`/?google_auth=error&message=${encodeURIComponent(message)}`, request.url)
    );
  }
}
