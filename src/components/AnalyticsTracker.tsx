'use client';

/**
 * Mounts once in the root layout. Two jobs:
 *   1. Record a pageview on every client-side route change (and the first paint).
 *   2. Record clicks on any element carrying a `data-track="<label>"` attribute,
 *      via a single delegated document listener — so instrumenting a new CTA is
 *      just adding the attribute, no per-component wiring.
 *
 * All sends are fire-and-forget (see lib/analytics/track.ts).
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackClick, trackPageview } from '@/lib/analytics/track';

export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  // Pageviews — fire when the path actually changes (StrictMode double-invokes
  // effects in dev; the ref guard keeps that from double-counting).
  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;
    trackPageview(pathname);
  }, [pathname]);

  // Delegated click tracking for [data-track] elements.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      const el = target?.closest<HTMLElement>('[data-track]');
      const label = el?.dataset.track;
      if (label) {
        trackClick(label, window.location.pathname);
      }
    }
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
