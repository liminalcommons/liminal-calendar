import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getConferenceBySlug } from '@/lib/events/conferences';
import { NavBar } from '@/components/NavBar';

/**
 * Limicon section shell: /c/[slug]. The view switcher (+ New event) lives in
 * the top bar; the ended-state banner appears once the window closes. The
 * permanent calendar is untouched — same app, same database.
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
      <NavBar
        hideAbout
        hideBrandText
        hideIntro
        viewBase={`/c/${slug}`}
        createHref={ended ? undefined : `/c/${slug}/events/new`}
      />
      {ended && (
        <div className="border-b border-grove-border bg-grove-surface/60">
          <p className="max-w-5xl mx-auto px-4 py-2 text-sm text-grove-text-muted italic">
            This conference has ended. Retained events live on in the{' '}
            <Link href="/list" className="underline underline-offset-4">
              permanent calendar
            </Link>
            .
          </p>
        </div>
      )}
      {children}
    </div>
  );
}

export async function generateStaticParams() {
  return [];
}
