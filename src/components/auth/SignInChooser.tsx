'use client';

import Link from 'next/link';

const AUTH_HOST = 'auth.liminalcalendar.com';

export function SignInChooser() {
  const handleHyloSignIn = () => {
    // Hand off to the auth subdomain via /start-hylo-signin — that page calls
    // signIn('hylo') which POSTs to /api/auth/signin/hylo with CSRF (Auth.js v5
    // returns Configuration on a bare GET when pages.signIn is set). NextAuth
    // there generates redirect_uri=https://auth.liminalcalendar.com/api/auth/callback/hylo
    // (which IS in Hylo's allowlist), sets a `.liminalcalendar.com`-scoped
    // session cookie on callback, then redirects back to callbackUrl.
    const callbackUrl = encodeURIComponent(`${window.location.origin}/`);
    window.location.href = `https://${AUTH_HOST}/start-hylo-signin?callbackUrl=${callbackUrl}`;
  };

  return (
    <div className="w-full max-w-sm rounded-lg bg-grove-surface border border-grove-border p-6 space-y-4">
      <h1 className="text-xl font-semibold text-grove-text">
        Sign in to Liminal Commons Calendar
      </h1>
      <p className="text-sm text-grove-text-muted">
        Choose how you&apos;d like to continue.
      </p>
      <button
        type="button"
        onClick={handleHyloSignIn}
        className="block w-full rounded-md bg-grove-accent-deep text-grove-surface py-2.5 px-4 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Continue with Liminal Commons (Hylo)
      </button>
      <Link
        href="/sign-in"
        className="block w-full rounded-md border border-grove-border text-grove-text py-2.5 px-4 text-sm font-medium text-center hover:bg-grove-border/30 transition-colors"
      >
        Continue with email or Google
      </Link>
    </div>
  );
}
