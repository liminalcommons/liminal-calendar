import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { EventDetailView } from '@/components/events/EventDetailView';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numId = parseInt(id.replace(/-\d{8}$/, ''), 10);

  try {
    const [event] = await db.select().from(events).where(eq(events.id, numId)).limit(1);
    if (!event) return { title: 'Event Not Found' };

    const title = event.title || 'Event';
    const description = event.description
      ? event.description.replace(/<[^>]*>/g, '').substring(0, 160)
      : 'An event on the Liminal Commons Calendar';
    const imageUrl = event.imageUrl || 'https://calendar.castalia.one/og-default.png';

    return {
      title: `${title} | Liminal Commons Calendar`,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        url: `https://calendar.castalia.one/events/${id}`,
        images: [{ url: imageUrl, width: 1024, height: 512, alt: title }],
        siteName: 'Liminal Commons Calendar',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [imageUrl],
      },
    };
  } catch {
    return { title: 'Liminal Commons Calendar' };
  }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <EventDetailView eventId={id} />
    </div>
  );
}
