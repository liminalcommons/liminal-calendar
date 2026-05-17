/**
 * /book — top-level 1:1 booking landing.
 *
 * Reached from the "Book" tab in the ViewToggle. Frames booking as a
 * first-class feature for the signed-in user, not buried under Settings.
 * For new users without a handle this is also the onboarding entry
 * point — claim handle inline before the rest of the content unlocks.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink, Calendar } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { NavBar } from '@/components/NavBar';
import { HandleEditor } from '@/components/booking/HandleEditor';
import { CollapsibleHandleEditor } from '@/components/booking/CollapsibleHandleEditor';
import { EventTypeList } from '@/components/booking/EventTypeList';
import { ProfileUrlBanner } from '@/components/booking/ProfileUrlBanner';
import { UpcomingBookingsList } from '@/components/booking/UpcomingBookingsList';
import { autoClaimHandle } from '@/lib/booking/auto-claim-handle';
import { listUpcomingBookingsForMember } from '@/lib/booking/upcoming-bookings';

export const dynamic = 'force-dynamic';

export default async function BookPage() {
  const member = await getCurrentMember(db);
  if (!member) {
    redirect('/welcome?next=/book');
  }

  // Silent auto-claim: if the member arrives without a handle, derive
  // one from their email/name and claim it. They can still rename via
  // the editor below — no upfront friction for the common case.
  let activeHandle: string | null = member.handle ?? null;
  if (!activeHandle) {
    activeHandle = await autoClaimHandle(db, member.id, {
      email: member.email,
      name: member.name,
    });
  }

  // Upcoming 1:1s for the durable "manage my bookings" surface.
  // Best-effort; surface an empty list rather than crashing the page.
  let upcoming: Awaited<ReturnType<typeof listUpcomingBookingsForMember>> = [];
  try {
    upcoming = await listUpcomingBookingsForMember(db, member.id, 60);
  } catch (err) {
    console.error('[/book] failed to load upcoming bookings', err);
  }

  return (
    <div className="min-h-screen bg-grove-bg flex flex-col">
      <NavBar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-8">
          <header>
            <h1 className="text-2xl font-semibold text-grove-text flex items-center gap-2">
              <Calendar size={22} className="text-grove-accent" aria-hidden="true" />
              1:1 Booking
            </h1>
            <p className="mt-1 text-sm text-grove-text-muted">
              Let people reserve time with you. Share one link, your weekly
              availability fills the slots.
            </p>
          </header>

          {activeHandle ? (
            <div className="space-y-2">
              <ProfileUrlBanner handle={activeHandle} />
              <div className="px-1">
                <CollapsibleHandleEditor initialHandle={activeHandle} />
              </div>
            </div>
          ) : (
            <section className="space-y-3 rounded border border-grove-border bg-grove-surface p-4">
              <div>
                <h2 className="text-base font-semibold text-grove-text">
                  Claim your booking handle
                </h2>
                <p className="text-sm text-grove-text-muted">
                  Pick a short URL slug. Your public page becomes
                  liminalcalendar.com/&lt;you&gt;.
                </p>
              </div>
              <HandleEditor initialHandle={null} />
            </section>
          )}

          {activeHandle && (
            <>
              <section className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-grove-text">
                    Your upcoming 1:1s
                  </h2>
                  <p className="text-sm text-grove-text-muted">
                    Meetings you're hosting or attending in the next 60 days.
                  </p>
                </div>
                <UpcomingBookingsList initial={upcoming} />
              </section>

              <hr className="border-grove-border/30" />

              <section className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-grove-text">
                    Event types
                  </h2>
                  <p className="text-sm text-grove-text-muted">
                    The kinds of sessions someone can book — name, duration,
                    where you meet.
                  </p>
                </div>
                <EventTypeList handle={activeHandle} />
              </section>

              <hr className="border-grove-border/30" />

              <section className="space-y-2">
                <div>
                  <h2 className="text-base font-semibold text-grove-text">
                    Weekly availability
                  </h2>
                  <p className="text-sm text-grove-text-muted">
                    Bookings respect the same weekly availability heatmap you
                    set in your profile.
                  </p>
                </div>
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-grove-border text-sm text-grove-text hover:bg-grove-surface"
                >
                  Edit availability in your profile
                  <ExternalLink size={12} aria-hidden="true" />
                </Link>
              </section>

            </>
          )}
        </div>
      </main>
    </div>
  );
}
