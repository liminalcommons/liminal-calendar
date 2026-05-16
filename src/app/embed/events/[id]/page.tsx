/**
 * Embeddable event detail at `/embed/events/<id>` — for pasting into
 * blog posts, group sites, or anywhere via iframe.
 *
 * Renders a chrome-stripped view of the event (no NavBar, no install
 * prompts). Only PUBLIC events are exposed; private/invite-only
 * events return 404 to avoid leaking via the embed URL.
 *
 * Public route — no auth required. Designed for iframe embedding;
 * frame-ancestors are intentionally not locked down.
 */

import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, ExternalLink } from 'lucide-react';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Strip embedded HTML tags from the description for safety in an
// untrusted iframe context. Preserves line breaks.
function sanitizeDescription(raw: string | null): string {
  if (!raw) return '';
  return raw.replace(/<[^>]*>/g, '').trim();
}

function formatRange(start: Date, end: Date | null, timezone: string | null): string {
  const tz = timezone ?? 'UTC';
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  });
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
  const dayPart = dateFmt.format(start);
  const startTime = timeFmt.format(start);
  if (!end) return `${dayPart} · ${startTime}`;
  const sameDay = dateFmt.format(end) === dayPart;
  const endTime = timeFmt.format(end);
  return sameDay
    ? `${dayPart} · ${startTime} – ${endTime}`
    : `${dayPart} ${startTime} – ${dateFmt.format(end)} ${endTime}`;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const numId = parseInt(id.replace(/-\d{8}$/, ''), 10);
  if (!Number.isFinite(numId)) notFound();

  const [event] = await db.select().from(events).where(eq(events.id, numId)).limit(1);
  if (!event) notFound();

  // Only public events are embeddable. Anything else (private, invite-only)
  // 404s so the embed URL can't leak details.
  if (event.visibility !== 'public') notFound();

  const description = sanitizeDescription(event.description);
  const range = formatRange(event.startsAt, event.endsAt, event.timezone);

  const canonicalUrl = `https://liminalcalendar.com/events/${id}`;

  return (
    <article className="min-h-screen bg-grove-bg text-grove-text p-4">
      <div className="max-w-xl mx-auto rounded border border-grove-border bg-grove-surface p-5 space-y-3">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold leading-tight">{event.title}</h1>
          <p className="inline-flex items-center gap-1.5 text-sm text-grove-text-muted">
            <Calendar size={14} aria-hidden="true" />
            {range}
          </p>
          {event.location && (
            <p className="inline-flex items-center gap-1.5 text-sm text-grove-text-muted">
              <MapPin size={14} aria-hidden="true" />
              <span className="truncate">{event.location}</span>
            </p>
          )}
        </header>

        {description && (
          <p className="text-sm whitespace-pre-line text-grove-text">{description}</p>
        )}

        <a
          href={canonicalUrl}
          target="_top"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium"
        >
          View &amp; RSVP
          <ExternalLink size={12} aria-hidden="true" />
        </a>

        <footer className="pt-2 border-t border-grove-border text-xs text-grove-text-muted">
          Powered by{' '}
          <a
            href="https://liminalcalendar.com"
            target="_top"
            rel="noopener noreferrer"
            className="underline"
          >
            Liminal Calendar
          </a>
        </footer>
      </div>
    </article>
  );
}
