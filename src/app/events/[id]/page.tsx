import { NavBar } from '@/components/NavBar';
import { EventDetailView } from '@/components/events/EventDetailView';

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
