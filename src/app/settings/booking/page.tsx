/**
 * /settings/booking — manage handle, bookable windows, and event types.
 *
 * Task 7 of Plan 3 (1:1 Booking). Server component: gates the page
 * via getCurrentMember(db) and passes the resolved member.handle down
 * to HandleEditor as initial value (avoiding an unnecessary GET round
 * trip — there is no GET endpoint for /api/profile/handle).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { HandleEditor } from '@/components/booking/HandleEditor';
import { BookableWindowsEditor } from '@/components/booking/BookableWindowsEditor';
import { EventTypeList } from '@/components/booking/EventTypeList';

export default async function Page() {
  const member = await getCurrentMember(db);
  if (!member) {
    redirect('/sign-in?next=/settings/booking');
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-grove-text-muted hover:text-grove-text transition-colors"
      >
        <ArrowLeft size={14} />
        Back to settings
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-grove-text">Booking</h1>
        <p className="mt-1 text-sm text-grove-text-muted">
          Let people book 1:1 time with you. Set your handle, your weekly
          availability, and the event types you offer.
        </p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-grove-text">Your handle</h2>
          <p className="text-sm text-grove-text-muted">
            The public URL slug at the front of your booking page.
          </p>
        </div>
        <HandleEditor initialHandle={member.handle ?? null} />
      </section>

      <hr className="border-grove-border/30" />

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-grove-text">Weekly availability</h2>
          <p className="text-sm text-grove-text-muted">
            The recurring windows when you accept bookings. Times are stored in
            your timezone.
          </p>
        </div>
        <BookableWindowsEditor />
      </section>

      <hr className="border-grove-border/30" />

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-grove-text">Event types</h2>
          <p className="text-sm text-grove-text-muted">
            The kinds of sessions someone can book — name, duration, where you meet.
          </p>
        </div>
        <EventTypeList />
      </section>
    </div>
  );
}
