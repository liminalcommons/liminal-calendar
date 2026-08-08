/**
 * Client-side analytics beacon. Fire-and-forget: every send is best-effort and
 * failures are swallowed so tracking can never disrupt the page.
 *
 * Visitor identity is an anonymous random token kept in localStorage — it lets
 * the dashboard count unique visitors without a cookie of record or any tie to
 * account identity.
 */

import type { AnalyticsEventType } from './events';

const VISITOR_KEY = 'liminal_vid';

// Not `/api/analytics/collect`: that path matches what content blockers filter
// on (EasyPrivacy and uBlock's built-in lists target the `analytics` segment,
// and `collect` is Google Analytics' own hit endpoint). A blocked beacon never
// leaves the browser, so the server sees nothing and the dashboard reads zero
// with no error anywhere. `/api/pulse` is a first-party path that doesn't look
// like a tracker. The old route still accepts posts for cached bundles.
export const ANALYTICS_ENDPOINT = '/api/pulse';

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // Fallback for older browsers without crypto.randomUUID.
  return `v_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** Stable per-browser anonymous id. Minted once, then reused. */
export function getVisitorId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled — track without a visitor id.
    return undefined;
  }
}

interface TrackPayload {
  type: AnalyticsEventType;
  path?: string;
  target?: string;
  visitorId?: string;
}

function send(payload: TrackPayload): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({ ...payload, visitorId: getVisitorId() });
  try {
    // sendBeacon survives page unload (important for click-through navigations)
    // and doesn't block. Fall back to keepalive fetch where it's unavailable.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(ANALYTICS_ENDPOINT, blob);
      if (ok) return;
    }
    void fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}

export function trackPageview(path: string): void {
  send({ type: 'pageview', path });
}

export function trackClick(target: string, path?: string): void {
  send({ type: 'click', target, path });
}
