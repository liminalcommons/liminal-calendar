/**
 * Public booking page at `/<handle>/<slug>` — Task 8 of Plan 3 (1:1 Booking).
 *
 * Server component that:
 *   1. Resolves <handle> → ownerMemberId via `resolveHandleToMemberId`.
 *      `notFound()` (404) if no such handle.
 *   2. Looks up the event type by `(ownerMemberId, slug)` —
 *      `getEventTypeBySlug`. `notFound()` if missing/inactive.
 *   3. Looks up the owner Member row for the display name/avatar.
 *   4. Renders the header + the client `<SlotPicker>` which handles
 *      the slot-fetch and POST /book lifecycle. The slot-picker is
 *      authoring-gated: anon visitors see event details and a
 *      "Sign in to book" CTA instead of the slot grid.
 *
 * Public route — anyone can view event details. The book action
 * itself requires sign-in (enforced both client-side by SlotPicker
 * and server-side by the /api/booking/.../book route).
 *
 * Next.js 15: `params` is async — must be awaited.
 */
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { resolveHandleToMemberId } from '@/lib/booking/handle-resolver';
import { getEventTypeBySlug } from '@/lib/booking/event-types-repo';
import { SlotPicker } from '@/components/booking/SlotPicker';

interface PageProps {
  params: Promise<{ handle: string; slug: string }>;
}

export default async function Page({ params }: PageProps) {
  const { handle, slug } = await params;

  const me = await getCurrentMember(db);
  const isAuthed = !!me;

  const ownerMemberId = await resolveHandleToMemberId(handle);
  if (ownerMemberId === null) {
    notFound();
  }

  const eventType = await getEventTypeBySlug(ownerMemberId, slug);
  if (!eventType) {
    notFound();
  }

  const [owner] = await db
    .select({ id: members.id, name: members.name, image: members.image })
    .from(members)
    .where(eq(members.id, ownerMemberId))
    .limit(1);
  if (!owner) {
    notFound();
  }

  const ownerLabel = owner.name?.trim() || handle;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-3">
        {owner.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={owner.image}
            alt=""
            className="w-12 h-12 rounded-full object-cover border border-grove-border"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-12 h-12 rounded-full bg-grove-bg border border-grove-border flex items-center justify-center text-grove-text-muted text-sm"
          >
            {ownerLabel.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold text-grove-text">
            Book with {ownerLabel}
          </h1>
          <p className="text-sm text-grove-text-muted">{eventType.title}</p>
        </div>
      </header>

      {eventType.description && (
        <p className="text-sm text-grove-text-muted whitespace-pre-line">
          {eventType.description}
        </p>
      )}

      <SlotPicker handle={handle} slug={slug} isAuthed={isAuthed} ownerLabel={ownerLabel} />
    </div>
  );
}
