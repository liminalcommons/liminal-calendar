import { NotificationPreferences } from '@/components/NotificationPreferences';
import { RsvpedEventsList } from '@/app/settings/notifications/RsvpedEventsList';

export default function Page() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold text-grove-text">Notifications</h1>
      <p className="text-sm text-grove-text-muted">
        Choose how you want to be reminded about events you&apos;re attending.
      </p>
      <NotificationPreferences />
      <hr className="border-grove-border/30" />
      <RsvpedEventsList />
    </div>
  );
}
