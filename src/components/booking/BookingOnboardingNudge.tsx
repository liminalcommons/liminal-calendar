/**
 * BookingOnboardingNudge — banner shown on `/` to signed-in members
 * who haven't claimed a handle yet. Encourages them to set up their
 * booking page.
 *
 * Server component — purely presentational, dismissibility is left
 * for a future iteration (cookie or member preference).
 */

import Link from 'next/link';
import { Link2 } from 'lucide-react';

export function BookingOnboardingNudge() {
  return (
    <div className="mx-2 mt-2 rounded border border-grove-border bg-grove-surface p-3 flex items-center gap-3">
      <div className="text-grove-accent shrink-0">
        <Link2 size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-grove-text">
          Set up your 1:1 booking page
        </p>
        <p className="text-xs text-grove-text-muted">
          Claim a handle so people can book time with you at
          liminalcalendar.com/&lt;you&gt;.
        </p>
      </div>
      <Link
        href="/settings/booking"
        className="shrink-0 px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium"
      >
        Get started
      </Link>
    </div>
  );
}
