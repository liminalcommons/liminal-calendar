'use client';

import { useEffect } from 'react';
import { signIn } from 'next-auth/react';

const DEFAULT_CALLBACK_URL = 'https://liminalcalendar.com/';

export default function StartHyloSignInPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectTo = params.get('callbackUrl') ?? DEFAULT_CALLBACK_URL;
    signIn('hylo', { redirectTo });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <p className="text-sm text-grove-text-muted">Redirecting to Hylo…</p>
    </div>
  );
}
