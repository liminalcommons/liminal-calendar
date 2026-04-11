'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const BASE = 'calendar.castalia.one/api/calendar/feed.ics';

function buildUrls(token?: string) {
  const suffix = token ? `?token=${token}` : '';
  const feedUrl = `https://${BASE}${suffix}`;
  const webcalUrl = `webcal://${BASE}${suffix}`;
  // Google Calendar works better with https:// in the cid param (webcal:// fails on mobile)
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`;
  const outlookUrl = `https://outlook.live.com/calendar/addcalendar?url=${encodeURIComponent(feedUrl)}`;
  return { feedUrl, webcalUrl, googleUrl, outlookUrl };
}

export function useFeedUrls() {
  const { status } = useSession();
  const [token, setToken] = useState<string | undefined>();

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/calendar/feed-token')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.feedToken) setToken(data.feedToken);
      })
      .catch(() => {}); // fallback to universal feed
  }, [status]);

  return buildUrls(token);
}
