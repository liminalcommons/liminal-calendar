/**
 * Client-derived context for analytics events.
 *
 * Kept coarse on purpose. The referrer is reduced to a host, the device to one
 * of three buckets from viewport width, and the visit id is a random token in
 * sessionStorage. No user-agent parsing, no full URLs, nothing that
 * re-identifies a person across sites.
 */

const VISIT_KEY = 'liminal_visit';

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

/**
 * Host of the referring page, or a marker.
 *
 * Full referring URLs routinely carry query strings with search terms,
 * campaign parameters and occasionally session tokens, so only the host is
 * kept. Same-origin navigation reports '(internal)' rather than the site's own
 * host, so "where did people arrive from" isn't drowned out by internal
 * clicks; no referrer at all is '(direct)'.
 */
export function referrerHost(
  referrer: string | undefined,
  currentHost: string | undefined,
): string {
  if (!referrer) return '(direct)';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (currentHost && host === currentHost.replace(/^www\./, '')) return '(internal)';
    return host || '(direct)';
  } catch {
    return '(direct)';
  }
}

/** Coarse device bucket from viewport width — no user-agent sniffing. */
export function deviceClass(width: number | undefined): DeviceClass {
  if (!width || width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Per-visit id, held in sessionStorage so it dies with the tab session. This
 * is what turns a pile of pageviews into visits — without it the dashboard
 * can count hits but not sessions, bounce rate, or pages per visit.
 */
export function getVisitId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    let id = window.sessionStorage.getItem(VISIT_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.sessionStorage.setItem(VISIT_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled — events still record, just without
    // visit grouping.
    return undefined;
  }
}

/** Everything the browser contributes, gathered in one place. */
export function clientContext(): {
  referrer: string;
  device: DeviceClass;
  visitId?: string;
} {
  if (typeof window === 'undefined') {
    return { referrer: '(direct)', device: 'desktop' };
  }
  return {
    referrer: referrerHost(document.referrer || undefined, window.location.hostname),
    device: deviceClass(window.innerWidth),
    visitId: getVisitId(),
  };
}
