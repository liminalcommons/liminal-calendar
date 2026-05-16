/**
 * MarketingLanding — explainer + sign-up CTA shown on `/` to
 * unauthenticated visitors. Signed-in users see the WeeklyGrid
 * instead (handled by the host page).
 *
 * Server component — purely presentational, no client state.
 */

import Link from 'next/link';
import { RuneAccent } from './RuneAccent';

export function MarketingLanding() {
  return (
    <div className="min-h-screen bg-grove-bg text-grove-text font-liminal">
      <header className="flex items-center justify-between px-6 py-5 border-b border-grove-border">
        <div className="flex items-center gap-2">
          <RuneAccent size="md" seed={2} />
          <span className="text-sm tracking-wide italic">Liminal Commons</span>
        </div>
        <Link
          href="/welcome"
          className="text-sm italic underline decoration-grove-accent underline-offset-4 text-grove-text-muted hover:text-grove-text"
        >
          sign in with Hylo &rarr;
        </Link>
      </header>

      <main
        data-testid="liminal-landing"
        className="max-w-4xl mx-auto px-6 py-16 space-y-16"
      >
        <section className="space-y-8 text-center">
          <SeasonalWheel />
          <p className="text-2xl sm:text-3xl leading-snug max-w-xl mx-auto italic">
            A place to keep track of when we gather —
            <br className="hidden sm:inline" /> the dinners, the rituals, the
            quiet weeks.
          </p>
          <p className="text-base text-grove-text-muted max-w-xl mx-auto">
            You can{' '}
            <Link
              href="/welcome"
              className="underline decoration-grove-accent underline-offset-4 hover:text-grove-text"
            >
              sign in with Hylo &rarr;
            </Link>{' '}
            to RSVP, or just read what&rsquo;s coming.
          </p>
        </section>

        <section
          data-testid="liminal-essay"
          className="liminal-prose mx-auto text-[1.05rem] leading-relaxed space-y-5"
        >
          <p>
            This is a calendar for{' '}
            <Term>
              coliving
              <Sidenote>
                Households where people share a kitchen, a porch, and the
                weekly rhythm of being in each other&rsquo;s lives.
              </Sidenote>
            </Term>{' '}
            communities &mdash; the places where someone makes coffee for
            seven, and a Tuesday potluck is older than the lease.
          </p>
          <p>
            Anyone can{' '}
            <Term>
              host
              <Sidenote>
                The person who tends the gathering. Not a manager &mdash;
                more like the one who chose the date and unlocked the door.
              </Sidenote>
            </Term>{' '}
            a gathering, and anyone can{' '}
            <Term>
              RSVP
              <Sidenote>
                A soft commitment. You can change your mind. Others see the
                count and can plan the bread.
              </Sidenote>
            </Term>
            . Some events are{' '}
            <Term>
              recurring rituals
              <Sidenote>
                Weekly dinners, Sunday walks, full-moon fires &mdash; events
                that keep their place by being kept.
              </Sidenote>
            </Term>{' '}
            &mdash; they keep their place on the calendar by being kept.
          </p>
          <p>
            Signing in goes through{' '}
            <Term>
              Hylo
              <Sidenote>
                A sister platform for community signals; sign-in is shared
                so your face is the same in both places.
              </Sidenote>
            </Term>
            . You can claim a{' '}
            <Term>
              handle
              <Sidenote>
                A short name like{' '}
                <span className="font-mono">liminalcalendar.com/you</span>{' '}
                &mdash; the address where people find you to book a time.
              </Sidenote>
            </Term>{' '}
            and that becomes your address on the calendar.
          </p>
        </section>

        <section
          id="how-it-works"
          className="rounded border border-grove-border bg-grove-surface p-6 space-y-3 scroll-mt-20"
        >
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

/**
 * Term + Sidenote — Tufte-style marginalia primitives. Pure presentation,
 * no JS, no client-state. The dotted underline on the term is the visual
 * affordance; the sidenote text lives in the right gutter on md+ and
 * collapses to an inline em-dashed gloss on mobile via globals.css.
 *
 * Compose: <Term>RSVP<Sidenote>a soft commitment…</Sidenote></Term>
 */
function Term({ children }: { children: React.ReactNode }) {
  return <span className="liminal-term">{children}</span>;
}

function Sidenote({ children }: { children: React.ReactNode }) {
  return <span className="liminal-sidenote">{children}</span>;
}

/**
 * SeasonalWheel — hand-drawn-feeling SVG. Pure decoration, no a11y label
 * beyond aria-hidden. Lines are intentionally wavy via cubic-bezier
 * controls; the four cardinal marks are slightly rotated; marginalia
 * (sprout, leaf, flame, branch) sit outside the wheel like inkwell
 * sketches in a commonplace book.
 */
function SeasonalWheel() {
  return (
    <svg
      role="img"
      aria-label="A hand-drawn seasonal wheel"
      viewBox="0 0 360 360"
      width="280"
      height="280"
      className="mx-auto text-grove-accent-deep"
      style={{ overflow: 'visible' }}
    >
      {/* outer wavy ring — two passes, slight offsets, dashed inner shadow */}
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M 180 40
             C 250 38, 322 86, 322 178
             C 324 252, 256 322, 180 322
             C 104 324, 38 254, 40 178
             C 38 102, 108 42, 180 40 Z"
          strokeWidth="2.2"
        />
        <path
          d="M 180 52
             C 244 50, 312 96, 310 178
             C 312 246, 250 310, 180 310
             C 110 312, 50 248, 52 178
             C 50 110, 116 54, 180 52 Z"
          strokeWidth="1"
          strokeDasharray="2 5"
          opacity="0.55"
        />
        {/* cardinal cross — irregular */}
        <path d="M 180 60 L 181 132" strokeWidth="1.6" />
        <path d="M 180 228 L 179 300" strokeWidth="1.6" />
        <path d="M 60 180 L 132 181" strokeWidth="1.6" />
        <path d="M 228 180 L 300 179" strokeWidth="1.6" />

        {/* small inner sun */}
        <circle cx="180" cy="180" r="8" strokeWidth="1.6" />
        <path d="M 180 158 L 180 168" strokeWidth="1.2" />
        <path d="M 180 192 L 180 202" strokeWidth="1.2" />
        <path d="M 158 180 L 168 180" strokeWidth="1.2" />
        <path d="M 192 180 L 202 180" strokeWidth="1.2" />
        <path d="M 164 164 L 170 170" strokeWidth="1.2" />
        <path d="M 190 190 L 196 196" strokeWidth="1.2" />
        <path d="M 196 164 L 190 170" strokeWidth="1.2" />
        <path d="M 170 190 L 164 196" strokeWidth="1.2" />
      </g>

      {/* marginalia — sprout (spring, top) */}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        transform="translate(168 8) rotate(-6)"
      >
        <path d="M 12 28 L 12 12" />
        <path d="M 12 16 C 4 14, 2 6, 8 4 C 11 8, 12 12, 12 16 Z" />
        <path d="M 12 19 C 20 17, 22 9, 16 7 C 13 11, 12 15, 12 19 Z" />
      </g>

      {/* marginalia — leaf (summer, right) */}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        transform="translate(322 168) rotate(20)"
      >
        <path d="M 4 14 C 14 -2, 30 0, 30 14 C 30 24, 18 30, 6 26 C 4 22, 2 18, 4 14 Z" />
        <path d="M 8 18 L 24 10" strokeWidth="1" />
      </g>

      {/* marginalia — flame / hearth (autumn, bottom) */}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        transform="translate(168 322) rotate(4)"
      >
        <path d="M 12 28 C 4 26, 2 18, 10 12 C 8 18, 14 16, 12 8 C 18 12, 22 18, 20 24 C 18 28, 14 30, 12 28 Z" />
      </g>

      {/* marginalia — bare branch (winter, left) */}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        transform="translate(8 162) rotate(-14)"
      >
        <path d="M 4 22 L 28 14" />
        <path d="M 12 19 L 8 12" />
        <path d="M 18 17 L 22 10" />
        <path d="M 24 15 L 20 8" />
      </g>

      {/* tiny dotted spiral near center, like ink residue */}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="0.9"
        opacity="0.5"
      >
        <path
          d="M 110 250 C 116 242, 124 240, 130 246 C 138 254, 132 264, 124 262"
          strokeDasharray="1 3"
        />
      </g>
    </svg>
  );
}
