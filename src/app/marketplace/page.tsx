import Link from 'next/link';
import { NavBar } from '@/components/NavBar';

export const metadata = {
  title: 'Liminal Marketplace',
  description:
    'A rapid experimentation ground. Bring an offer, leave with signal. Biweekly on Saturdays.',
};

export default function MarketplaceLandingPage() {
  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-grove-bg text-grove-text">
        <section className="mx-auto max-w-3xl px-6 pt-16 pb-12">
          <p className="text-sm uppercase tracking-[0.2em] text-grove-accent">
            Biweekly · Saturdays
          </p>
          <h1 className="mt-3 text-5xl font-semibold leading-tight tracking-tight">
            Liminal Marketplace
          </h1>
          <p className="mt-6 text-lg text-grove-text-muted">
            A rapid experimentation ground. Bring an offer — tech product,
            facilitation format, session concept, or wild idea — and test it
            live. No polishing required. Just signal.
          </p>
          <p className="mt-4 italic text-grove-text-muted">
            &ldquo;Come with an offer, leave with signal.&rdquo;
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-10 border-t border-grove-border">
          <h2 className="text-2xl font-semibold">Format</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-grove-border bg-grove-surface p-5">
              <p className="text-sm uppercase tracking-wider text-grove-accent">
                Idea Phase · 15 min each
              </p>
              <p className="mt-2 text-xl font-medium">4 ideas · 2 rooms</p>
              <p className="mt-2 text-sm text-grove-text-muted">
                Two ideas run in parallel across two rooms, 15 minutes each,
                back-to-back. Raw pitches, no decks. Distill under pressure.
              </p>
            </div>
            <div className="rounded-lg border border-grove-border bg-grove-surface p-5">
              <p className="text-sm uppercase tracking-wider text-grove-accent">
                Practice · 30 min
              </p>
              <p className="mt-2 text-xl font-medium">2 spots</p>
              <p className="mt-2 text-sm text-grove-text-muted">
                Deeper testing with the room. Feedback loops, co-creation.
              </p>
            </div>
          </div>
          <p className="mt-6 text-sm text-grove-text-muted">
            Two identical breakout rooms. Move freely during practice. Total
            structured time: 60 minutes.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-10 border-t border-grove-border">
          <h2 className="text-2xl font-semibold">Roles</h2>
          <ul className="mt-6 space-y-2 text-grove-text-muted">
            <li><span className="text-grove-text">Presenters — Idea (4)</span> · pitch concept fast and raw</li>
            <li><span className="text-grove-text">Presenters — Practice (2)</span> · stress-test with the room</li>
            <li><span className="text-grove-text">Facilitators (2)</span> · one per room — hold time, hold space</li>
            <li><span className="text-grove-text">Audience</span> · react, reflect, co-create</li>
          </ul>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-12 border-t border-grove-border">
          <div className="rounded-xl border border-grove-accent/40 bg-grove-surface p-6">
            <h2 className="text-xl font-semibold">Bring an offer</h2>
            <p className="mt-2 text-grove-text-muted">
              Submit your idea or practice spot for the next session. The host
              will reach out before the event.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/marketplace/submit"
                className="inline-flex items-center rounded-md bg-grove-accent px-4 py-2 text-sm font-medium text-grove-bg hover:bg-grove-accent-deep"
              >
                Submit an offer
              </Link>
              <Link
                href="/"
                className="inline-flex items-center rounded-md border border-grove-border px-4 py-2 text-sm hover:bg-grove-bg"
              >
                See the calendar
              </Link>
              <a
                href="https://castalia.one/liminal-commons/bazaar/lobby"
                className="inline-flex items-center rounded-md border border-grove-border px-4 py-2 text-sm hover:bg-grove-bg"
              >
                Enter the room
              </a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
