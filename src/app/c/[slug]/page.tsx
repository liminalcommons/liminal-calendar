import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getConferenceBySlug } from '@/lib/events/conferences';

/**
 * Conference landing: a simple welcome banner, not the calendar.
 * The four views live one click away in the tabs above.
 */
export default async function ConferenceIndex({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const conference = await getConferenceBySlug(slug);
  if (!conference) notFound();

  return (
    <main className="max-w-2xl mx-auto px-4 py-12 text-center">
      <h1 className="font-serif text-4xl text-grove-text font-light italic leading-tight">
        Welcome to {conference.name}
      </h1>
      <p className="text-sm text-grove-text-muted mt-4 leading-relaxed">
        A month of sessions hosted by the community. Every member can host —
        create freely, and everything is visible to all members.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
        <Link
          href={`/c/${slug}/upcoming`}
          className="px-4 py-2 rounded-lg bg-grove-accent-deep text-grove-surface text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Next 24 hours
        </Link>
        <Link
          href={`/c/${slug}/list`}
          className="px-4 py-2 rounded-lg border border-grove-border text-sm text-grove-text hover:bg-grove-border/20 transition-colors"
        >
          All events
        </Link>
        <Link
          href={`/c/${slug}/week`}
          className="px-4 py-2 rounded-lg border border-grove-border text-sm text-grove-text hover:bg-grove-border/20 transition-colors"
        >
          Week
        </Link>
        <Link
          href={`/c/${slug}/month`}
          className="px-4 py-2 rounded-lg border border-grove-border text-sm text-grove-text hover:bg-grove-border/20 transition-colors"
        >
          Month
        </Link>
      </div>
      <p className="text-xs text-grove-text-muted mt-8">
        New here?{' '}
        <Link href="/welcome" className="underline underline-offset-4 text-grove-accent-deep">
          Sign up
        </Link>{' '}
        to join and host.
      </p>
    </main>
  );
}
