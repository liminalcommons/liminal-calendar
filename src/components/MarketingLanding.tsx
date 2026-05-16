/**
 * MarketingLanding — explainer + sign-up CTA shown on `/` to
 * unauthenticated visitors. Signed-in users see the WeeklyGrid
 * instead (handled by the host page).
 *
 * Server component — purely presentational, no client state.
 */

import Link from 'next/link';
import { Calendar, Link2, Users } from 'lucide-react';
import { RuneAccent } from './RuneAccent';

export function MarketingLanding() {
  return (
    <div className="min-h-screen bg-grove-bg text-grove-text">
      <header className="flex items-center justify-between px-6 py-4 border-b border-grove-border">
        <div className="flex items-center gap-2">
          <RuneAccent size="md" seed={2} />
          <span className="font-semibold text-sm tracking-wide">Liminal Commons</span>
        </div>
        <Link
          href="/welcome"
          className="px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium"
        >
          Sign in
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-16">
        <section className="space-y-5 text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            A calendar that belongs to your community.
          </h1>
          <p className="text-lg text-grove-text-muted max-w-2xl mx-auto">
            Liminal Calendar is a shared, public calendar for groups, plus
            Calendly-style 1:1 booking from a handle you can share anywhere.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/welcome"
              className="px-4 py-2 rounded bg-grove-accent text-white font-medium"
            >
              Get started
            </Link>
            <Link
              href="/list"
              className="px-4 py-2 rounded border border-grove-border text-sm hover:bg-grove-surface"
            >
              Browse events
            </Link>
          </div>
        </section>

        <section className="grid gap-6 sm:grid-cols-3">
          <FeatureCard
            icon={<Calendar size={20} />}
            title="Shared events"
            body="One calendar for the whole community. RSVP, repeat, and discover what's happening."
          />
          <FeatureCard
            icon={<Link2 size={20} />}
            title="1:1 booking"
            body="Claim a handle, set your hours, and share liminalcalendar.com/you to take meetings."
          />
          <FeatureCard
            icon={<Users size={20} />}
            title="Invite-only events"
            body="Some gatherings are open, others are intimate. Choose who can see and join."
          />
        </section>

        <section className="rounded border border-grove-border bg-grove-surface p-6 space-y-3">
          <h2 className="text-xl font-semibold">How it works</h2>
          <ol className="space-y-2 text-sm text-grove-text-muted list-decimal pl-5">
            <li>Sign in with your community account.</li>
            <li>Pick a handle — that becomes your booking URL.</li>
            <li>Set your weekly availability and the kinds of sessions you offer.</li>
            <li>Share <span className="font-mono">liminalcalendar.com/&lt;your-handle&gt;</span> wherever you want bookings to come from.</li>
          </ol>
          <div className="pt-2">
            <Link
              href="/welcome"
              className="inline-flex items-center px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium"
            >
              Create your booking page
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-grove-border px-6 py-6 text-center text-xs text-grove-text-muted">
        Liminal Commons · <Link href="/welcome" className="underline">Sign in</Link>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded border border-grove-border bg-grove-surface p-5 space-y-2">
      <div className="text-grove-accent">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-grove-text-muted">{body}</p>
    </div>
  );
}
