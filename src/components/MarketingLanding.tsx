/**
 * MarketingLanding — public landing shown on `/` to unauthenticated
 * visitors. Liminal Calendar is the public face / contact surface of
 * Liminal Commons. Signed-in users see the WeeklyGrid (handled upstream).
 *
 * Copy authored by Erik (2026-05-24). The backdrop is a breathing node-graph
 * echoing the Liminal Web's community-map symbolism (see LiminalWebBackdrop).
 */

import Link from 'next/link';
import { RuneAccent } from './RuneAccent';
import { MoonPhase } from './MoonPhase';
import { LiminalWebBackdrop } from './LiminalWebBackdrop';

/**
 * Chrome fix banner is a one-time migration aid for users trapped behind a
 * pre-`a8c58de` service worker (stale SW shadowing the deployed fix — only a
 * local Chrome reset evicts it). It self-retires a week after posting so it
 * doesn't outlive the trapped population. Evaluated server-side per request
 * (page is `force-dynamic`), so this is a live clock, not a build-time freeze.
 */
const CHROME_FIX_BANNER_EXPIRES = new Date('2026-06-16T23:59:59Z');

/** Runic hairline divider — a glyph flanked by fading rules, marking a turn
 *  between movements of the text. */
function GlyphDivider({ seed }: { seed: number }) {
  return (
    <div className="flex items-center justify-center gap-3 py-1" aria-hidden="true">
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-grove-border" />
      <RuneAccent size="sm" seed={seed} className="!opacity-40" />
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-grove-border" />
    </div>
  );
}

export function MarketingLanding() {
  const showChromeFix = new Date() < CHROME_FIX_BANNER_EXPIRES;
  return (
    <div className="relative min-h-screen overflow-hidden bg-grove-bg text-grove-text font-liminal flex flex-col">
      {/* Living constellation behind everything */}
      <LiminalWebBackdrop className="absolute inset-0 h-full w-full opacity-50" />

      {/* Chrome fix notice — instructions for Chrome users hitting the
          stuck-on-landing / stale-cache issue (supplied by Roger, 2026-06-09). */}
      {showChromeFix && (
      <aside
        role="note"
        data-testid="chrome-fix-banner"
        className="relative z-20 border-b border-grove-accent/40 bg-grove-accent/10 px-6 py-4 text-sm text-grove-text"
      >
        <p className="font-semibold not-italic">
          Using Google Chrome and the calendar won&rsquo;t load? Reset Chrome to fix it:
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
          <li>Open Google Chrome.</li>
          <li>Click the three dots in the top-right corner of the browser.</li>
          <li>Select <strong>Settings</strong> from the drop-down menu.</li>
          <li>In the left sidebar, click on <strong>Reset settings</strong>.</li>
          <li>Click <strong>Restore settings to their original defaults</strong>.</li>
          <li>Confirm by clicking <strong>Reset settings</strong>.</li>
        </ol>
        <p className="mt-2 leading-relaxed text-grove-text-muted">
          The action will disable your extensions and clear temporary data like
          cookies, but your bookmarks, history, and saved passwords will remain
          intact.
        </p>
      </aside>
      )}

      <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-grove-border/60">
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
        className="relative z-10 flex-1 flex items-start justify-center px-6 py-12 sm:py-16"
      >
        <div className="max-w-2xl space-y-5 text-grove-text">
          {/* Hero: lunar threshold mark + title */}
          <div className="flex flex-col items-center gap-2 pb-2">
            <span className="flex items-center gap-2 opacity-70">
              <RuneAccent size="sm" seed={4} />
              <MoonPhase />
              <RuneAccent size="sm" seed={1} />
            </span>
            <h1 className="text-3xl sm:text-4xl leading-snug italic text-center">
              Welcome to the Liminal Calendar.
            </h1>
          </div>

          {/* Movement I — the invitation */}
          <p className="text-base sm:text-lg leading-relaxed">
            Here you will find a variety of events &mdash; different people,
            different time zones, different styles and modalities.
          </p>
          <p className="text-base sm:text-lg leading-relaxed">
            What every event on this calendar has in common, other than all
            being free and open for all members to attend, is a desire to
            connect people in new and exciting ways, to encourage us to relate,
            explore and collaborate with each other more deeply.
          </p>

          <GlyphDivider seed={3} />

          {/* Movement II — crossing the threshold */}
          <p className="text-base sm:text-lg leading-relaxed">
            You are free to explore the calendar and its contents, but if you
            wish to participate you will need to sign up. Doing this will not
            only allow you to attend all of the events, but also to receive
            notifications, reminders, updates and to give your feedback. It
            also ensures that events are attended by real humans and not bots
            or AI pilots.
          </p>
          <p className="text-base sm:text-lg leading-relaxed">
            Please feel free to be yourself and to get the most out of the rich
            and varied experiences available here.
          </p>

          <GlyphDivider seed={5} />

          {/* Movement III — the send-off */}
          <p className="text-base sm:text-lg leading-relaxed">
            If you do encounter anything that puzzles or troubles you, there is
            an onboarding and feedback session scheduled every Tuesday which is
            intended, as the title suggests, for users to drop in with any
            questions, suggestions or problems. You can also send an email to{' '}
            <a
              href="mailto:support@liminalcalendar.com"
              className="underline decoration-grove-accent underline-offset-4 hover:text-grove-text"
            >
              support@liminalcalendar.com
            </a>{' '}
            if you are unable to get there.
          </p>
          <p className="text-lg sm:text-xl leading-relaxed italic text-center text-grove-accent">
            Enjoy your ride.
          </p>

          <div className="pt-4 text-center">
            <Link
              href="/welcome"
              className="inline-block text-sm italic underline decoration-grove-accent underline-offset-4 text-grove-text-muted hover:text-grove-text"
            >
              sign in &rarr;
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
