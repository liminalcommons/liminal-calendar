'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const BASE = 'calendar.castalia.one/api/calendar/feed.ics';

function buildUrls(token?: string) {
  const suffix = token ? `?token=${token}` : '';
  const feedUrl = `https://${BASE}${suffix}`;
  const webcalUrl = `webcal://${BASE}${suffix}`;
  // Google Calendar's cid= param requires webcal:// — cid=https://... makes
  // desktop show "Unable to add this calendar. Please check the URL." Android
  // Chrome hands the outer link to the Google Calendar app which handles
  // webcal:// correctly; iOS opens Google Calendar web which also accepts it.
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
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
