'use client';

import Link from 'next/link';

const AUTH_HOST = 'auth.liminalcalendar.com';

export function SignInChooser() {
  const handleHyloSignIn = () => {
    // Hylo's `castalia` OAuth client only allows redirect URIs at
    // auth.liminalcalendar.com (subdomain), not the bare root. So we
    // initiate sign-in on the auth subdomain — NextAuth there generates
    // redirect_uri=https://auth.liminalcalendar.com/api/auth/callback/hylo
    // (which IS in Hylo's allowlist), processes the callback, sets a
    // session cookie scoped to `.liminalcalendar.com`, then redirects
    // back to the root via callbackUrl. The shared-cookie scope makes
    // the session visible on liminalcalendar.com.
    const callbackUrl = encodeURIComponent(`${window.location.origin}/`);
    window.location.href = `https://${AUTH_HOST}/api/auth/signin/hylo?callbackUrl=${callbackUrl}`;
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
