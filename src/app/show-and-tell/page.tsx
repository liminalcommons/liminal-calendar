import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { events, topicSubmissions } from '@/lib/db/schema';
import { and, asc, desc, eq, gte, ne } from 'drizzle-orm';

export const metadata: Metadata = {
  title: 'Show & Tell — Liminal Calendar',
  description:
    'A biweekly 60-minute meeting for ideas and insights across the Liminal Web. Submit an idea, attend the next session, see what others have brought.',
};

export const dynamic = 'force-dynamic';

const SHOW_AND_TELL_TITLE = 'Show & Tell';
const SLOT_COUNT = 4;

async function loadNextSession() {
  try {
    const now = new Date();
    const [row] = await db
      .select()
      .from(events)
      .where(and(eq(events.title, SHOW_AND_TELL_TITLE), gte(events.startsAt, now)))
      .orderBy(asc(events.startsAt))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

async function loadLineup() {
  try {
    const rows = await db
      .select({
        id: topicSubmissions.id,
        title: topicSubmissions.title,
        description: topicSubmissions.description,
        submitterName: topicSubmissions.submitterName,
        imageUrl: topicSubmissions.imageUrl,
        status: topicSubmissions.status,
        createdAt: topicSubmissions.createdAt,
      })
      .from(topicSubmissions)
      .where(ne(topicSubmissions.status, 'declined'))
      .orderBy(desc(topicSubmissions.createdAt))
      .limit(SLOT_COUNT);
    return rows;
  } catch {
    return [];
  }
}

function formatSessionDate(date: Date) {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
    timeZoneName: 'short',
  });
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

export default async function ShowAndTellPage() {
  const [nextSession, lineup] = await Promise.all([
    loadNextSession(),
    loadLineup(),
  ]);

  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => lineup[i] ?? null);

  return (
    <main className="min-h-screen bg-grove-bg text-grove-text">
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="text-sm text-grove-text-muted hover:text-grove-text"
        >
          ← Calendar
        </Link>

        <header className="mt-10 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-grove-accent">
            Liminal Web · Biweekly
          </p>
          <h1 className="mt-3 font-serif text-5xl leading-tight text-grove-text sm:text-6xl">
            Show &amp; Tell
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-grove-text-muted">
            A biweekly 60-minute meeting for ideas and insights across the
            Liminal Web. Four slots per session — bring something half-formed,
            or come empty-handed and listen.
          </p>
        </header>

        <section className="mt-14 rounded-lg border border-grove-border bg-grove-surface p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-xl text-grove-text">Next session</h2>
            {nextSession ? (
              <span className="text-xs uppercase tracking-[0.18em] text-grove-text-muted">
                {formatSessionDate(new Date(nextSession.startsAt))}
              </span>
            ) : (
              <span className="text-xs uppercase tracking-[0.18em] text-grove-text-muted">
                Date TBA
              </span>
            )}
          </div>
          {nextSession ? (
            <p className="mt-3 text-sm text-grove-text-muted">
              60 minutes. Four 10-minute slots. Open to anyone in the Liminal
              Web orbit.
              {nextSession.location && (
                <>
                  {' '}Meeting in{' '}
                  <span className="text-grove-text">{nextSession.location}</span>.
                </>
              )}
            </p>
          ) : (
            <p className="mt-3 text-sm text-grove-text-muted">
              The next biweekly session hasn&apos;t been scheduled yet. Submit
              an idea anyway — it&apos;ll be queued for the next one.
            </p>
          )}
          <div className="mt-5 flex items-center gap-4 text-sm">
            <Link
              href="/show-and-tell/submit"
              className="rounded-md border border-grove-accent bg-grove-accent/10 px-3 py-1.5 text-grove-accent hover:bg-grove-accent/20"
            >
              Submit a Topic →
            </Link>
            <Link
              href="/"
              className="text-grove-text-muted hover:text-grove-text"
            >
              See the calendar →
            </Link>
          </div>
        </section>

        <section className="mt-14">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-2xl text-grove-text">The lineup</h2>
            <span className="text-xs uppercase tracking-[0.18em] text-grove-text-muted">
              {lineup.length} of {SLOT_COUNT} {lineup.length === 1 ? 'slot' : 'slots'} filled
            </span>
          </div>

          <ol className="mt-5 grid gap-4 sm:grid-cols-2">
            {slots.map((submission, idx) => {
              const slot = String(idx + 1).padStart(2, '0');
              if (!submission) {
                return (
                  <li
                    key={`open-${idx}`}
                    className="flex min-h-[160px] flex-col items-start justify-between rounded-lg border border-dashed border-grove-border bg-grove-surface/40 p-5"
                  >
                    <span className="text-xs uppercase tracking-[0.18em] text-grove-accent">
                      {slot}
                    </span>
                    <span className="text-sm italic text-grove-text-muted">
                      Open slot — could be yours
                    </span>
                    <Link
                      href="/show-and-tell/submit"
                      className="text-xs text-grove-accent hover:text-grove-accent-deep"
                    >
                      Claim →
                    </Link>
                  </li>
                );
              }
              return (
                <li
                  key={submission.id}
                  className="flex flex-col overflow-hidden rounded-lg border border-grove-border bg-grove-surface"
                >
                  {submission.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={submission.imageUrl}
                      alt=""
                      className="aspect-[16/9] w-full object-cover"
                    />
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.18em] text-grove-accent">
                        {slot}
                      </span>
                      <span className="text-xs text-grove-text-muted">
                        {submission.submitterName}
                      </span>
                    </div>
                    <h3 className="font-medium text-grove-text">{submission.title}</h3>
                    <p className="text-sm leading-relaxed text-grove-text-muted">
                      {truncate(submission.description, 180)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mt-14 max-w-2xl space-y-4">
          <h2 className="font-serif text-2xl text-grove-text">How it works</h2>
          <p className="leading-relaxed text-grove-text-muted">
            Submit a Topic. It shows up here as part of the next session&apos;s
            lineup. Every other week we meet for 60 minutes and present four
            of them. The meetings are recorded and — with your consent —
            edited into clips for YouTube, Facebook, and Telegram.
          </p>
          <p className="leading-relaxed text-grove-text-muted">
            Open to anyone in the Liminal Web orbit. Bringing something is
            welcome but never required.
          </p>
        </section>
      </div>
    </main>
  );
}
