'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UpcomingView } from '@/components/calendar/UpcomingView';

/** Conference upcoming tab: any signed-in member can create while active. */
export default function ConferenceUpcomingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [active, setActive] = useState(false);

  useEffect(() => {
    fetch(`/api/conferences?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setActive(c?.status === 'active'))
      .catch(() => {});
  }, [slug]);

  return (
    <UpcomingView
      conferenceSlug={slug}
      title="Next 24 hours"
      newEventHref={`/c/${slug}/events/new`}
      showCreate={active}
    />
  );
}
