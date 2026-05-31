'use client';

import { signIn } from 'next-auth/react';

export function SignInChooser() {
  const handleCastaliaSignIn = () => {
    signIn('logto', { callbackUrl: `${window.location.origin}/` });
  };

  return (
    <div className="w-full max-w-sm rounded-lg bg-grove-surface border border-grove-border p-6 space-y-4">
      <h1 className="text-xl font-semibold text-grove-text">
        Sign in to Liminal Commons Calendar
      </h1>
      <p className="text-sm text-grove-text-muted">
        Sign in with your Castalia account.
      </p>
      <div>
        <button
          type="button"
          onClick={handleCastaliaSignIn}
          className="block w-full rounded-md bg-grove-accent text-grove-surface py-2.5 px-4 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Sign in with Castalia
        </button>
        <p className="text-[11px] text-grove-text-muted mt-1.5 px-1">
          Use the same email you&apos;ve always used. Your roles, RSVPs and history carry over.
        </p>
      </div>
    </div>
  );
}
