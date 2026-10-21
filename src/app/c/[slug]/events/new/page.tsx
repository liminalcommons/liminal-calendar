'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { EventForm } from '@/components/events/EventForm';
import type { EventFormValues } from '@/lib/chat-tools';

interface ConferenceInfo {
  id: number;
  slug: string;
  name: string;
  status: string;
}

/**
 * Limicon event creation: any signed-in member may publish while the
 * conference is active. Seeds from the week-view handoff (?day=&slot= and
 * the quick-create localStorage draft) exactly like /events/new.
 */
function ConferenceNewEventInner() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conference, setConference] = useState<ConferenceInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/conferences?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        setConference(c && typeof c.id === 'number' ? c : null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [slug]);

  const initialFromUrl = useMemo<Partial<EventFormValues>>(() => {
    const out: Partial<EventFormValues> = {};
    const day = searchParams.get('day');
    const slotStr = searchParams.get('slot');
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) out.date = day;
    if (slotStr != null) {
      const slot = Number(slotStr);
      if (Number.isFinite(slot) && slot >= 0 && slot < 48) {
        const h = Math.floor(slot / 2);
        const m = (slot % 2) * 30;
        out.startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const endTotal = h * 60 + m + 60;
        const eh = Math.min(23, Math.floor(endTotal / 60));
        const em = endTotal >= 24 * 60 ? 30 : endTotal % 60;
        out.endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
      }
    }
    return out;
  }, [searchParams]);

  const [externalValues, setExternalValues] = useState<Partial<EventFormValues>>(initialFromUrl);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('calendar-quick-create-handoff');
      if (!raw) return;
      localStorage.removeItem('calendar-quick-create-handoff');
      const draft = JSON.parse(raw) as Partial<EventFormValues>;
      if (draft && typeof draft === 'object') {
        setExternalValues((prev) => ({ ...prev, ...draft }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-grove-bg">
        <NavBar />
        <div className="flex items-center justify-center py-20">
          <p className="text-grove-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!conference || conference.status !== 'active') {
    return (
      <div className="min-h-screen bg-grove-bg">
        <NavBar />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-grove-text-muted italic">
            Event creation is closed right now.
          </p>
          <Link
            href={`/c/${slug}/list`}
            className="inline-block mt-4 text-sm underline underline-offset-4 text-grove-accent-deep"
          >
            Back
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-grove-text-muted hover:text-grove-text mb-4 transition-colors"
        >
          &larr; Back
        </button>
        <EventForm
          mode="create"
          externalValues={externalValues}
          conference={{
            id: conference.id,
            slug: conference.slug,
            name: conference.name,
            status: conference.status,
          }}
        />
      </main>
    </div>
  );
}

export default function ConferenceNewEventPage() {
  return (
    <Suspense fallback={null}>
      <ConferenceNewEventInner />
    </Suspense>
  );
}
