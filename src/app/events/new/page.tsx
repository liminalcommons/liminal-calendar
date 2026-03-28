import { NavBar } from '@/components/NavBar';
import { EventForm } from '@/components/events/EventForm';

export const dynamic = 'force-dynamic';

export default function NewEventPage() {
  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <EventForm mode="create" />
      </main>
    </div>
  );
}
