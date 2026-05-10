import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Show & Tell — Liminal Calendar',
  description:
    'Biweekly social and communication infrastructure for idea and insight exchange across the Liminal Web. One hour, snack-sized contributions, open to all.',
};

export default function ShowAndTellPage() {
  return (
    <main className="min-h-screen bg-grove-bg text-grove-text">
      <div className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="text-sm text-grove-text-muted hover:text-grove-text"
        >
          ← Calendar
        </Link>

        <header className="mt-10">
          <p className="text-xs uppercase tracking-[0.2em] text-grove-accent">
            Liminal Web · Biweekly
          </p>
          <h1 className="mt-3 font-serif text-5xl leading-tight text-grove-text sm:text-6xl">
            Show &amp; Tell
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-grove-text-muted">
            A shared hour for idea and insight exchange across the Liminal Web.
            Bring a demo, a question, a half-formed spark — or come empty-handed
            and listen. Both are welcome.
          </p>
        </header>

        <section className="mt-14 space-y-6">
          <h2 className="font-serif text-2xl text-grove-text">The hour</h2>
          <ul className="space-y-3 text-grove-text">
            <li className="flex gap-4">
              <span className="w-16 shrink-0 text-grove-accent">15 min</span>
              <span>
                <strong className="text-grove-text">Warm-up.</strong>{' '}
                <span className="text-grove-text-muted">
                  A low-stakes prompt to shift the room from audience-mode to
                  participant-mode before anyone presents.
                </span>
              </span>
            </li>
            <li className="flex gap-4">
              <span className="w-16 shrink-0 text-grove-accent">4 × 10</span>
              <span>
                <strong className="text-grove-text">Topics.</strong>{' '}
                <span className="text-grove-text-muted">
                  Four ten-minute Topics, TED-style. A concise, impactful
                  presentation of what you&apos;re working on, thinking about,
                  or wrestling with. Time is tight by design — bring one thing
                  and show it well.
                </span>
              </span>
            </li>
            <li className="flex gap-4">
              <span className="w-16 shrink-0 text-grove-accent">5 min</span>
              <span>
                <strong className="text-grove-text">Breakout.</strong>{' '}
                <span className="text-grove-text-muted">
                  Loose ends, side conversations, the residue that becomes the
                  next exchange.
                </span>
              </span>
            </li>
          </ul>
        </section>

        <section className="mt-14 space-y-4">
          <h2 className="font-serif text-2xl text-grove-text">How it works</h2>
          <p className="leading-relaxed text-grove-text-muted">
            Show &amp; Tell is the social and communication infrastructure for
            an exchange — not a stage, not a meetup. The hour is the anchor;
            recordings and follow-up threads carry the residue forward, so what
            starts in the room doesn&apos;t end there.
          </p>
          <p className="leading-relaxed text-grove-text-muted">
            Open to anyone in the Liminal Web orbit. Bringing something is
            welcome but never required. Come as you are.
          </p>
        </section>

        <section className="mt-14 space-y-4">
          <h2 className="font-serif text-2xl text-grove-text">
            What&apos;s a Topic?
          </h2>
          <p className="leading-relaxed text-grove-text-muted">
            A Topic is one ten-minute presentation. Think TED-talk in
            miniature: a single idea, demo, or insight, told with care.
            Concise, impactful, and shaped to the time. The constraint is the
            craft.
          </p>
          <p className="leading-relaxed text-grove-text-muted">
            Submission is AI-assisted — the host helps you sharpen what your
            ten minutes is really about, so when you take the stage, you know
            exactly what you&apos;re showing and why.
          </p>
          <Link
            href="/show-and-tell/submit"
            className="mt-2 inline-block rounded-md border border-grove-accent bg-grove-accent/10 px-4 py-2 text-sm font-medium text-grove-accent hover:bg-grove-accent/20"
          >
            Submit a Topic →
          </Link>
        </section>

        <section className="mt-14 rounded-lg border border-grove-border bg-grove-surface p-6">
          <h2 className="font-serif text-xl text-grove-text">Next session</h2>
          <p className="mt-2 text-sm text-grove-text-muted">
            Sessions appear on the calendar as they&apos;re scheduled.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-grove-accent hover:text-grove-accent-deep"
          >
            See the calendar →
          </Link>
        </section>
      </div>
    </main>
  );
}
