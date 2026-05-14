import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { events, topicSubmissions } from '@/lib/db/schema';
import { and, asc, desc, eq, gte, ne } from 'drizzle-orm';

export const metadata: Metadata = {
  title: 'Show & Tell — Liminal Calendar',
  description:
    'A biweekly 40-minute meeting for ideas and insights across the Liminal Web. Submit an idea, attend the next session, see what others have brought.',
};

export const dynamic = 'force-dynamic';

const SHOW_AND_TELL_TITLE = 'Show & Tell';

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

async function loadOpenSubmissions() {
  try {
    const rows = await db
      .select({
        id: topicSubmissions.id,
        title: topicSubmissions.title,
        description: topicSubmissions.description,
        submitterName: topicSubmissions.submitterName,
        status: topicSubmissions.status,
        createdAt: topicSubmissions.createdAt,
      })
      .from(topicSubmissions)
      .where(ne(topicSubmissions.status, 'declined'))
      .orderBy(desc(topicSubmissions.createdAt))
      .limit(20);
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
  const [nextSession, submissions] = await Promise.all([
    loadNextSession(),
    loadOpenSubmissions(),
  ]);

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
            A biweekly 40-minute meeting for ideas and insights across the
            Liminal Web. Bring something half-formed, or come empty-handed and
            listen.
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
              40 minutes. Open to anyone in the Liminal Web orbit.
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
              href="/show-and-tell/submit/quick"
              className="rounded-md border border-grove-accent bg-grove-accent/10 px-3 py-1.5 text-grove-accent hover:bg-grove-accent/20"
            >
              Submit an idea →
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
            <h2 className="font-serif text-2xl text-grove-text">
              Submitted ideas
            </h2>
            <span className="text-xs uppercase tracking-[0.18em] text-grove-text-muted">
              {submissions.length} {submissions.length === 1 ? 'idea' : 'ideas'}
            </span>
          </div>

          {submissions.length === 0 ? (
            <p className="mt-4 text-grove-text-muted">
              No ideas submitted yet. Be the first —{' '}
              <Link
                href="/show-and-tell/submit/quick"
                className="text-grove-accent hover:text-grove-accent-deep"
              >
                drop one in
              </Link>
              .
            </p>
          ) : (
            <ol className="mt-5 space-y-3">
              {submissions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border border-grove-border bg-grove-surface px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-medium text-grove-text">{s.title}</h3>
                    <span className="shrink-0 text-xs text-grove-text-muted">
                      {s.submitterName}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-grove-text-muted">
                    {truncate(s.description, 240)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-14 space-y-4">
          <h2 className="font-serif text-2xl text-grove-text">How it works</h2>
          <p className="leading-relaxed text-grove-text-muted">
            Submit an idea (email is enough — no account required). It shows up
            on this page. Every other week we meet for 40 minutes and present a
            handful of them. The meetings are recorded and edited into clips for
            YouTube, Facebook, and other channels.
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
