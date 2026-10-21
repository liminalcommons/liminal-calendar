import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getConferenceBySlug } from '@/lib/events/conferences';
import { NavBar } from '@/components/NavBar';

const TABS = [
  { href: 'upcoming', label: 'Next 24h' },
  { href: 'list', label: 'List' },
  { href: 'week', label: 'Week' },
  { href: 'month', label: 'Month' },
] as const;

/**
 * Limicon section shell: /c/[slug]. Conference name + status in the header,
 * four view tabs, create link, and an ended-state banner once the window
 * closes. The permanent calendar is untouched — same app, same database.
 */
export default async function ConferenceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const conference = await getConferenceBySlug(slug);
  if (!conference) notFound();

  const ended = conference.status === 'ended';

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar hideAbout hideBrandText hideIntro viewBase={`/c/${slug}`} />
      <div className="border-b border-grove-border bg-grove-surface/60">
        <div className="max-w-5xl mx-auto px-4 pt-5 pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-serif text-2xl text-grove-text font-light italic">
              {conference.name} Calendar
            </span>
            <span
              className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                ended
                  ? 'border-grove-border text-grove-text-muted'
                  : conference.status === 'active'
                    ? 'border-grove-accent/60 text-grove-accent-deep'
                    : 'border-grove-border text-grove-text-muted'
              }`}
            >
              {conference.status}
            </span>
          </div>
          {ended ? (
            <p className="text-sm text-grove-text-muted mt-2 italic">
              This conference has ended. Retained events live on in the{' '}
              <Link href="/list" className="underline underline-offset-4">
                permanent calendar
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-grove-text-muted mt-1 italic">
              Every member can host here — create freely, all members see it.
            </p>
          )}
          <nav className="flex gap-1 mt-3 flex-wrap">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={`/c/${slug}/${t.href}`}
                className="px-3 py-1.5 rounded-md text-sm text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
              >
                {t.label}
              </Link>
            ))}
            {!ended && (
              <Link
                href={`/c/${slug}/events/new`}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
              >
                + New event
              </Link>
            )}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}

export async function generateStaticParams() {
  return [];
}
