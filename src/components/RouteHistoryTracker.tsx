'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { recordEvent } from '@/lib/client-logger';

// Drop a marker into the client-logger buffer on every route transition.
// In App Router, `usePathname()` only updates when the rendered path
// actually changes, so this gives us "the user clicked from /list to
// /events/42 to /welcome" trail in the bug report — the missing context
// for "I clicked something and then it broke" reports.
export function RouteHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    const qs = searchParams?.toString();
    const current = qs ? `${pathname}?${qs}` : pathname;
    if (previousPath.current === current) return;
    if (previousPath.current === null) {
      recordEvent('info', `[route] entered ${current}`);
    } else {
      recordEvent('info', `[route] ${previousPath.current} → ${current}`);
    }
    previousPath.current = current;
  }, [pathname, searchParams]);

  return null;
}
