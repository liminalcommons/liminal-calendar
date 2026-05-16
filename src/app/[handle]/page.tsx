/**
 * Public profile index at `/<handle>` — the shareable Calendly-style
 * "book me" URL. Lists every active event type the owner offers, each
 * linking to `/<handle>/<slug>`.
 *
 * Public route — no auth gate. The booking action itself (slot
 * selection on the child page) still requires sign-in.
 */

import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, MapPin, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { resolveHandleToMemberId } from '@/lib/booking/handle-resolver';
import { listMyEventTypes } from '@/lib/booking/event-types-repo';

interface PageProps {
  params: Promise<{ handle: string }>;
}

const LOCATION_LABEL: Record<string, string> = {
  castalia: 'Castalia room',
  external_link: 'Video call',
  in_person: 'In person',
};

export default async function Page({ params }: PageProps) {
  const { handle } = await params;

  const ownerMemberId = await resolveHandleToMemberId(handle);
  if (ownerMemberId === null) {
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

  const eventTypes = await listMyEventTypes(ownerMemberId);
  const ownerLabel = owner.name?.trim() || handle;

  const viewer = await getCurrentMember(db);
  const viewerIsOwner = viewer?.id === ownerMemberId;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-4">
        {owner.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={owner.image}
            alt=""
            className="w-16 h-16 rounded-full object-cover border border-grove-border"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-16 h-16 rounded-full bg-grove-bg border border-grove-border flex items-center justify-center text-grove-text-muted text-lg"
          >
            {ownerLabel.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-grove-text">{ownerLabel}</h1>
          <p className="text-sm text-grove-text-muted">
            Pick a session to book.
          </p>
        </div>
      </header>

      {eventTypes.length === 0 ? (
        viewerIsOwner ? (
          <div className="rounded border border-dashed border-grove-border bg-grove-bg p-5 text-center space-y-3">
            <p className="text-sm text-grove-text">
              You haven&apos;t set up any bookable sessions yet.
            </p>
            <Link
              href="/settings/booking"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium"
            >
              <Plus size={14} aria-hidden="true" />
              Create your first session
            </Link>
          </div>
        ) : (
          <p className="text-sm text-grove-text-muted italic">
            {ownerLabel} hasn&apos;t set up any bookable sessions yet.
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {eventTypes.map((et) => (
            <li key={et.id}>
              <Link
                href={`/${handle}/${et.slug}`}
                className="block rounded border border-grove-border bg-grove-bg p-4 hover:border-grove-accent hover:bg-grove-surface transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-medium text-grove-text">{et.title}</h2>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-grove-text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} aria-hidden="true" />
                    {et.durationMinutes} min
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} aria-hidden="true" />
                    {LOCATION_LABEL[et.locationKind] ?? et.locationKind}
                  </span>
                </div>
                {et.description && (
                  <p className="mt-2 text-sm text-grove-text-muted line-clamp-2 whitespace-pre-line">
                    {et.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
