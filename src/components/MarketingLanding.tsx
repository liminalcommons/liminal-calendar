/**
 * MarketingLanding — public landing shown on `/` to unauthenticated
 * visitors. Liminal Calendar is the public face / contact surface of
 * Liminal Commons. Signed-in users see the WeeklyGrid (handled upstream).
 *
 * Copy authored by Erik (2026-05-24).
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
        className="flex-1 flex items-start justify-center px-6 py-12 sm:py-16"
      >
        <div className="max-w-2xl space-y-5 text-grove-text">
          <h1 className="text-3xl sm:text-4xl leading-snug italic text-center">
            Welcome to the Liminal Calendar.
          </h1>

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
          <p className="text-base sm:text-lg leading-relaxed italic">
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
