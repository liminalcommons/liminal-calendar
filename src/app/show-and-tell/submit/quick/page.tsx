'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';

export default function QuickSubmitPage() {
  const { data: session, status: sessionStatus } = useSession();
  const authed = sessionStatus === 'authenticated';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }
    if (!authed && (!email.trim() || !name.trim())) {
      setError('Name and email are required for guest submissions.');
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, string> = { title, description };
      if (!authed) {
        body.submitterName = name;
        body.submitterEmail = email;
      }
      const res = await fetch('/api/topics/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Submission failed (${res.status})`);
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionStatus === 'loading') {
    return (
      <>
        <NavBar />
        <main className="min-h-screen bg-grove-bg text-grove-text">
          <section className="mx-auto max-w-2xl px-6 py-20 text-center text-grove-text-muted">
            Loading…
          </section>
        </main>
      </>
    );
  }

  if (done) {
    return (
      <>
        <NavBar />
        <main className="min-h-screen bg-grove-bg text-grove-text">
          <section className="mx-auto max-w-2xl px-6 py-20 text-center">
            <h1 className="font-serif text-3xl">Thanks — your idea is in.</h1>
            <p className="mt-4 text-grove-text-muted">
              It&apos;ll show up on the Show &amp; Tell page for the next session.
              The host will be in touch.
            </p>
            <Link
              href="/show-and-tell"
              className="mt-6 inline-block text-sm text-grove-accent hover:text-grove-accent-deep"
            >
              ← Back to Show &amp; Tell
            </Link>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-grove-bg text-grove-text">
        <div className="mx-auto max-w-xl px-6 py-12">
          <Link
            href="/show-and-tell"
            className="text-sm text-grove-text-muted hover:text-grove-text"
          >
            ← Show &amp; Tell
          </Link>
          <h1 className="mt-4 font-serif text-3xl text-grove-text sm:text-4xl">
            Submit an idea
          </h1>
          <p className="mt-2 text-grove-text-muted">
            Quick form — drop your idea for the next Show &amp; Tell meeting.
            Email is enough; no account required.
          </p>
          <p className="mt-2 text-sm text-grove-text-muted">
            Prefer a guided flow?{' '}
            <Link
              href="/show-and-tell/submit"
              className="text-grove-accent hover:text-grove-accent-deep"
            >
              Chat with the AI host →
            </Link>
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            {!authed && (
              <>
                <div>
                  <label className="block text-sm text-grove-text-muted mb-1.5">
                    Your name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-md border border-grove-border bg-grove-surface px-3 py-2 text-grove-text outline-none focus:border-grove-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-grove-text-muted mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full rounded-md border border-grove-border bg-grove-surface px-3 py-2 text-grove-text outline-none focus:border-grove-accent"
                  />
                  <p className="mt-1.5 text-xs text-grove-text-muted">
                    So the host can reach you about your slot.
                  </p>
                </div>
              </>
            )}
            {authed && (
              <p className="text-sm text-grove-text-muted">
                Submitting as{' '}
                <span className="text-grove-text">
                  {session?.user?.name || session?.user?.email}
                </span>
                .
              </p>
            )}

            <div>
              <label className="block text-sm text-grove-text-muted mb-1.5">
                Idea title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="What's the one thing you want to show?"
                className="w-full rounded-md border border-grove-border bg-grove-surface px-3 py-2 text-grove-text outline-none focus:border-grove-accent"
              />
            </div>

            <div>
              <label className="block text-sm text-grove-text-muted mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={6}
                placeholder="A paragraph or two. What is it, why now, what would you like the room to walk away with?"
                className="w-full rounded-md border border-grove-border bg-grove-surface px-3 py-2 text-grove-text outline-none focus:border-grove-accent resize-y"
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-md border border-grove-accent bg-grove-accent/10 px-4 py-2 text-sm font-medium text-grove-accent hover:bg-grove-accent/20 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit idea'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
