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
      className={`bg-grove-accent-deep/10 border-b border-grove-border px-3 py-2 transition-all duration-300 ${
        show ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden py-0 border-b-0'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar size={14} className="text-grove-accent shrink-0" />
          <span className="text-xs text-grove-text truncate hidden sm:inline">
            Subscribe to stay updated
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={GOOGLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] px-2 py-0.5 rounded bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
          >
            Google
          </a>
          <a
            href={WEBCAL_URL}
            className="text-[11px] px-2 py-0.5 rounded bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
          >
            Apple
          </a>
          <a
            href={OUTLOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] px-2 py-0.5 rounded bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
          >
            Outlook
          </a>
          <button
            onClick={dismiss}
            className="p-0.5 rounded text-grove-text-muted hover:text-grove-text transition-colors"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
