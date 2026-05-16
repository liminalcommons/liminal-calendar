/**
 * MarketingLanding — explainer + sign-up CTA shown on `/` to
 * unauthenticated visitors. Signed-in users see the WeeklyGrid
 * instead (handled by the host page).
 *
 * Server component — fetches a small slice of upcoming public events
 * and renders them as essay-style entries with hand-drawn marginal
 * icons, lifecycle badges, and a "planted N days ago" stamp.
 */

import Link from 'next/link';
import { and, asc, gte } from 'drizzle-orm';
import { formatDistanceToNow, format } from 'date-fns';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { publicOnlyEventsCondition } from '@/lib/events/visibility';
import { RuneAccent } from './RuneAccent';

type UpcomingEvent = {
  id: number;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string | null;
  location: string | null;
  recurrenceRule: string | null;
  creatorName: string;
  createdAt: Date | null;
};

async function fetchUpcomingPublicEvents(limit = 5): Promise<UpcomingEvent[]> {
  try {
    const rows = await db
      .select({
        id: events.id,
        title: events.title,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        timezone: events.timezone,
        location: events.location,
        recurrenceRule: events.recurrenceRule,
        creatorName: events.creatorName,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(and(publicOnlyEventsCondition(), gte(events.startsAt, new Date())))
      .orderBy(asc(events.startsAt))
      .limit(limit);
    return rows;
  } catch (e) {
    console.error(
      'MarketingLanding: upcoming-events query failed:',
      e instanceof Error ? e.message : String(e),
    );
    return [];
  }
}

type Lifecycle = { emoji: string; word: string; tone: string };
function lifecycleFor(startsAt: Date): Lifecycle {
  const now = Date.now();
  const ms = startsAt.getTime() - now;
  const fortnight = 14 * 24 * 60 * 60 * 1000;
  if (ms < 0) return { emoji: '🍂', word: 'past', tone: 'text-grove-text-dim' };
  if (ms <= fortnight)
    return { emoji: '🌿', word: 'confirmed', tone: 'text-grove-green-deep' };
  return { emoji: '🌱', word: 'proposed', tone: 'text-grove-accent-deep' };
}

export async function MarketingLanding() {
  const upcoming = await fetchUpcomingPublicEvents(5);

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
          id="upcoming"
          data-testid="upcoming-events"
          className="liminal-prose mx-auto space-y-8 scroll-mt-20"
        >
          <h2 className="text-xl italic tracking-wide text-grove-text">
            What&rsquo;s coming
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-base text-grove-text-muted italic">
              The calendar is quiet this week. Nothing on the books &mdash; or
              nothing public, anyway.
            </p>
          ) : (
            upcoming.map((ev, i) => <EventEntry key={ev.id} ev={ev} i={i} />)
          )}
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
 * EventEntry — a single upcoming event rendered as an essay paragraph
 * with a hand-drawn marginal icon, lifecycle badge, and "planted N days
 * ago" stamp. No card. No grid.
 */
function EventEntry({ ev, i }: { ev: UpcomingEvent; i: number }) {
  const lc = lifecycleFor(ev.startsAt);
  const planted = ev.createdAt
    ? `planted ${formatDistanceToNow(ev.createdAt, { addSuffix: false })} ago`
    : null;
  const when = format(ev.startsAt, 'EEEE, MMMM d');
  const time = format(ev.startsAt, 'h:mma').toLowerCase();
  return (
    <article
      data-testid="event-entry"
      className="space-y-1.5"
    >
      <header className="flex items-baseline gap-3">
        <span aria-hidden className="shrink-0 -mt-0.5">
          <MarginalIcon kind={i % 5} />
        </span>
        <h3 className="italic text-lg sm:text-xl leading-snug flex-1">
          {ev.title}
        </h3>
        <span
          data-testid="lifecycle-badge"
          className={`shrink-0 text-xs italic font-normal whitespace-nowrap ${lc.tone}`}
          title={`Lifecycle: ${lc.word}`}
        >
          <span aria-hidden>{lc.emoji}</span> {lc.word}
        </span>
      </header>
      <p className="text-sm text-grove-text-muted leading-relaxed pl-8">
        <span className="font-mono not-italic text-grove-text-dim">{when}</span>
        <span className="mx-1.5">·</span>
        <span className="font-mono not-italic text-grove-text-dim">{time}</span>
        {ev.location ? (
          <>
            <span className="mx-1.5">·</span>at {ev.location}
          </>
        ) : null}
        <span className="mx-1.5">·</span>hosted by {ev.creatorName}
        {ev.recurrenceRule ? (
          <>
            <span className="mx-1.5">·</span>
            <em>{ev.recurrenceRule}</em>
          </>
        ) : null}
      </p>
      {planted ? (
        <p className="text-xs italic text-grove-text-dim pl-8">{planted}</p>
      ) : null}
    </article>
  );
}

/**
 * MarginalIcon — small hand-drawn-feeling SVG. Five variants picked by
 * the caller (typically `index % 5`). Each is a stroke-only doodle so
 * it inherits `currentColor` and lives in the page's serif-and-ink key.
 */
function MarginalIcon({ kind }: { kind: number }) {
  const stroke = {
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.4,
  };
  const common = (children: React.ReactNode) => (
    <svg
      role="img"
      aria-hidden
      viewBox="0 0 28 28"
      width="22"
      height="22"
      className="text-grove-accent-deep inline-block"
      style={{ overflow: 'visible' }}
    >
      <g {...stroke}>{children}</g>
    </svg>
  );

  switch (kind % 5) {
    case 0: // cup with curl of steam (a quiet gathering / tea)
      return common(
        <>
          <path d="M 5 12 C 5 11, 6 10.5, 7 10.5 L 20 10.5 C 21 10.5, 22 11, 22 12 L 21.4 19 C 21.2 21, 19.5 22, 18 22 L 9 22 C 7.5 22, 5.8 21, 5.6 19 Z" />
          <path d="M 22 13 C 24.5 13, 25 16, 22.5 17" />
          <path d="M 10 7 C 10 5, 11 4.5, 11 3" strokeDasharray="1.4 1.6" />
          <path d="M 14 7 C 14 5, 13 4.5, 13 3" strokeDasharray="1.4 1.6" />
          <path d="M 18 7 C 18 5, 19 4.5, 19 3" strokeDasharray="1.4 1.6" />
        </>,
      );
    case 1: // small flame (hearth)
      return common(
        <>
          <path d="M 14 4 C 11 8, 8 11, 8 16 C 8 20, 11 24, 14 24 C 17 24, 20 20, 20 16 C 20 13, 18 11, 17 13 C 18 10, 15 9, 14 4 Z" />
          <path d="M 12 18 C 13 19, 15 19, 16 18" />
        </>,
      );
    case 2: // sprout in soil
      return common(
        <>
          <path d="M 14 22 L 14 12" />
          <path d="M 14 14 C 8 13, 6 9, 9 6 C 12 8, 14 11, 14 14 Z" />
          <path d="M 14 16 C 21 15, 23 11, 20 8 C 17 10, 15 13, 14 16 Z" />
          <path d="M 4 23 L 24 23" />
          <path d="M 6 25 L 9 23.5" />
          <path d="M 19 25 L 22 23.5" />
        </>,
      );
    case 3: // crescent moon w/ stars (evening ritual)
      return common(
        <>
          <path d="M 22 14 C 22 8, 17 4, 11 6 C 14 6, 18 9, 18 14 C 18 19, 14 22, 11 22 C 17 24, 22 20, 22 14 Z" />
          <path d="M 5 8 L 7 8" strokeDasharray="0.6 1.2" />
          <path d="M 6 7 L 6 9" strokeDasharray="0.6 1.2" />
          <path d="M 8 18 L 9 18" strokeDasharray="0.6 1.2" />
          <path d="M 8.5 17.5 L 8.5 18.5" strokeDasharray="0.6 1.2" />
        </>,
      );
    case 4: // bowl + spoon (potluck)
    default:
      return common(
        <>
          <path d="M 4 14 C 4 13, 5 12.5, 6 12.5 L 22 12.5 C 23 12.5, 24 13, 24 14 C 24 19, 19 23, 14 23 C 9 23, 4 19, 4 14 Z" />
          <path d="M 18 6 C 19 6, 20 7, 20 8.5 C 20 10, 19 11, 18 11 C 17 11, 16 12, 16 13 L 17 13" />
          <path d="M 7 16 C 9 17, 11 17, 13 16" strokeWidth="1" opacity="0.7" />
        </>,
      );
  }
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
