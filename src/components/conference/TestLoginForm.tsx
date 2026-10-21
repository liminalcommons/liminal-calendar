'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Preview-only test sign-in form. Rendered on the conference landing when
 * NEXT_PUBLIC_TEST_LOGIN=1 (set for preview deployments only, never
 * production). Posts name + shared code to /api/auth/test-login, which mints
 * a real session cookie; reload lands the tester signed in.
 */
export function TestLoginForm() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, code: code.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(
          res.status === 403
            ? 'That code is not right — check it and try again.'
            : (data?.error as string | undefined) ?? 'Sign-in failed. Try again.',
        );
        return;
      }
      window.location.reload();
    } catch {
      setError('Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-8 mx-auto max-w-sm rounded-xl border border-grove-border bg-grove-surface p-4 text-left"
    >
      <p className="text-sm font-medium text-grove-text">Test sign-in</p>
      <p className="text-xs text-grove-text-muted mt-1">
        The real sign-in isn&apos;t wired to this test address yet — use this while testing.
      </p>
      <label className="block text-xs text-grove-text-muted mt-3 mb-1">Your name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Erik"
        maxLength={80}
        className="w-full px-3 py-2 text-sm rounded-lg border border-grove-border bg-grove-bg text-grove-text focus:outline-none focus:ring-2 focus:ring-grove-accent"
      />
      <label className="block text-xs text-grove-text-muted mt-3 mb-1">Test code</label>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Ask Erik for the code"
        autoComplete="off"
        className="w-full px-3 py-2 text-sm rounded-lg border border-grove-border bg-grove-bg text-grove-text focus:outline-none focus:ring-2 focus:ring-grove-accent"
      />
      {error && (
        <p role="alert" className="text-xs text-red-400 mt-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || code.trim().length === 0}
        className="mt-3 w-full py-2 rounded-lg bg-grove-accent-deep text-grove-surface text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {busy ? 'Signing in…' : 'Sign in to test'}
      </button>
    </form>
  );
}
