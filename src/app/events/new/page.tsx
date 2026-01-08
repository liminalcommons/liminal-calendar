import { Header } from '@/components/Header';
import { EventForm } from '@/components/EventForm';

export default function NewEventPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Create New Event
        </h1>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <EventForm mode="create" />
        </div>
      </main>
    </div>
  );
}
