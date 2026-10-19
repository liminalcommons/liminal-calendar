import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getConferenceBySlug } from '@/lib/events/conferences';
import { NavBar } from '@/components/NavBar';
import { EventForm } from '@/components/events/EventForm';

/** Limicon event creation: any signed-in member may publish while active. */
export default async function ConferenceNewEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const conference = await getConferenceBySlug(slug);
  if (!conference) notFound();

  if (conference.status !== 'active') {
    return (
      <div className="min-h-screen bg-grove-bg">
        <NavBar />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-grove-text-muted italic">
            {conference.name} is {conference.status} — event creation is closed.
          </p>
          <Link
            href={`/c/${slug}/list`}
            className="inline-block mt-4 text-sm underline underline-offset-4 text-grove-accent-deep"
          >
            Back to {conference.name}
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <EventForm
          mode="create"
          conference={{
            id: conference.id,
            slug: conference.slug,
            name: conference.name,
            status: conference.status,
          }}
        />
      </main>
    </div>
  );
}
