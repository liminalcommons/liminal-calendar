'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ScrollableEventList } from '@/components/calendar/ScrollableEventList';

/** Conference list tab: bottomless scroll over the conference scope. */
export default function ConferenceListPage() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/conferences?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setStatus(c?.status ?? null))
      .catch(() => {});
  }, [slug]);

  return (
    <ScrollableEventList
      conferenceSlug={slug}
      title="Conference events"
      conferenceActive={status === 'active'}
      newEventHref={`/c/${slug}/events/new`}
      emptyText="No events yet — create the first one."
      cachePrefix="cal:conflist:v1:"
    />
  );
}
