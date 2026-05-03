'use client';

import { useEffect, useState } from 'react';

type RsvpedEvent = { id: number; title: string; starts_at: string };

export function RsvpedEventsList() {
  const [events, setEvents] = useState<RsvpedEvent[] | null>(null);

  useEffect(() => {
    fetch('/api/preferences/notifications/rsvped-events?limit=5')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]));
  }, []);

  if (events === null) return <div className="text-sm text-grove-text-muted">Loading upcoming…</div>;
  if (events.length === 0)
    return <div className="text-sm text-grove-text-muted">No upcoming RSVPs — you&apos;ll see them here when you say yes to events.</div>;

  return (
    <div>
      <h2 className="text-sm font-semibold text-grove-text mb-3">Events you&apos;ll be notified about</h2>
      <ul className="space-y-1">
        {events.map((e) => (
          <li key={e.id} className="text-sm text-grove-text">
            <span className="text-grove-text-muted mr-2">{new Date(e.starts_at).toLocaleString()}</span>
            {e.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
