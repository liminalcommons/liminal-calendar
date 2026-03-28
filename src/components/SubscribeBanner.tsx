'use client';

import { useState, useEffect } from 'react';
import { X, Calendar } from 'lucide-react';

const FEED_URL = 'https://calendar.castalia.one/api/calendar/feed.ics';
const WEBCAL_URL = `webcal://calendar.castalia.one/api/calendar/feed.ics`;
const GOOGLE_URL = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(WEBCAL_URL)}`;
const OUTLOOK_URL = `https://outlook.live.com/calendar/addcalendar?url=${encodeURIComponent(FEED_URL)}`;

const STORAGE_KEY = 'calendar-subscribed';

export function SubscribeBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY) === 'true';
    if (!dismissed) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShow(false);
  };

  return (
    <div
      className={`bg-grove-accent-deep/10 border-b border-grove-border px-4 py-2.5 flex items-center justify-between gap-3 transition-all duration-300 ${
        show ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden py-0 border-b-0'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Calendar size={16} className="text-grove-accent shrink-0" />
        <span className="text-sm text-grove-text truncate">
          Subscribe to stay updated with upcoming events
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a
          href={GOOGLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-2.5 py-1 rounded-md bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
        >
          Google
        </a>
        <a
          href={WEBCAL_URL}
          className="text-xs px-2.5 py-1 rounded-md bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
        >
          Apple
        </a>
        <a
          href={OUTLOOK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-2.5 py-1 rounded-md bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
        >
          Outlook
        </a>
        <button
          onClick={dismiss}
          className="p-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
          aria-label="Dismiss subscribe banner"
          title="Don't show again"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
