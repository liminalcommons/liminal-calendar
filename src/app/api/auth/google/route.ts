// GET /api/auth/google - Start Google OAuth flow
// Redirects admin to Google consent screen

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getGoogleAuthUrl } from '@/lib/google-calendar-write';

export async function GET() {
  // Verify user is authenticated
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: 'Must be signed in to connect Google Calendar' },
      { status: 401 }
    );
  }

  // Generate OAuth URL with user ID in state for security
  const authUrl = getGoogleAuthUrl(userId);

  // Redirect to Google OAuth
  return NextResponse.redirect(authUrl);
}
