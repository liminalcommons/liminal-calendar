/**
 * Wrapper around fetch. Previously auto-redirected to auth gateway on 401,
 * but that caused an infinite loop when the gateway's JWE cookie contained
 * an expired Hylo token (the gateway doesn't refresh it during OAuth, and
 * on mobile the Hylo app universal-link hijacks the OAuth start).
 *
 * Mirror of castalia fix 074ba137: no redirect. Instead, emit a
 * `calendar:session-expired` window event so a mounted UI component can show
 * a re-auth banner. That replaces the silent `console.warn` that left the
 * app looking broken with no visible cause.
 */
export const SESSION_EXPIRED_EVENT = 'calendar:session-expired';

let lastExpiredEventAt = 0;

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401 && typeof window !== 'undefined') {
    // Throttle so a storm of failed parallel requests only surfaces one banner.
    const now = Date.now();
    if (now - lastExpiredEventAt > 5000) {
      lastExpiredEventAt = now;
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
  }

  return res;
}
