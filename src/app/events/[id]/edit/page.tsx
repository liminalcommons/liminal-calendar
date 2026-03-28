import { NavBar } from '@/components/NavBar';
import { EventForm } from '@/components/events/EventForm';

export default async function EditEventPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <EventForm mode="edit" eventId={id} />
      </main>
    </div>
  );
}
