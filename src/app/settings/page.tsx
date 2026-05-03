import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { NotificationPreferences } from '@/components/NotificationPreferences';
import { RsvpedEventsList } from '@/app/settings/RsvpedEventsList';

export default function Page() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-grove-text-muted hover:text-grove-text transition-colors"
      >
        <ArrowLeft size={14} />
        Back to calendar
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-grove-text">Settings</h1>
        <p className="mt-1 text-sm text-grove-text-muted">
          Manage how Liminal Calendar talks to you.
        </p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-grove-text">Notifications</h2>
          <p className="text-sm text-grove-text-muted">
            Choose how you want to be reminded about events you&apos;re attending.
          </p>
        </div>
        <NotificationPreferences />
      </section>

      <hr className="border-grove-border/30" />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-grove-text">Upcoming events</h2>
        <RsvpedEventsList />
      </section>
    </div>
  );
}
