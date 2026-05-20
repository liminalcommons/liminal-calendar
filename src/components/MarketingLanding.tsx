/**
 * MarketingLanding — minimal landing shown on `/` to unauthenticated
 * visitors. Liminal Calendar is the public face / contact surface of
 * Liminal Commons. Signed-in users see the WeeklyGrid (handled upstream).
 */

import Link from 'next/link';
import { RuneAccent } from './RuneAccent';

export function MarketingLanding() {
  return (
    <div className="min-h-screen bg-grove-bg text-grove-text font-liminal flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 border-b border-grove-border">
        <div className="flex items-center gap-2">
          <RuneAccent size="md" seed={2} />
          <span className="text-sm tracking-wide italic">Liminal Commons</span>
        </div>
        <Link
          href="/welcome"
          className="text-sm italic underline decoration-grove-accent underline-offset-4 text-grove-text-muted hover:text-grove-text"
        >
          sign in &rarr;
        </Link>
      </header>

      <main
        data-testid="liminal-landing"
        className="flex-1 flex items-center justify-center px-6"
      >
        <div className="max-w-xl text-center space-y-6">
          <h1 className="text-3xl sm:text-4xl leading-snug italic">
            A calendar for liminal-web events.
          </h1>
          <p className="text-base text-grove-text-muted italic">
            This is how to reach Liminal Commons &mdash; through the calendar.
          </p>
        </div>
      </main>
    </div>
  );
}
