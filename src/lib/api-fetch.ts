/**
 * Wrapper around fetch. Previously auto-redirected to auth gateway on 401,
 * but that caused an infinite loop when the gateway's JWE cookie contained
 * an expired Hylo token (the gateway doesn't refresh it during OAuth, and
 * on mobile the Hylo app universal-link hijacks the OAuth start).
 *
 * Mirror of castalia fix 074ba137: just warn and let the app degrade
 * gracefully. Users re-auth manually via the Sign In button.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401 && typeof window !== 'undefined') {
    console.warn('[apiFetch] 401 — session expired. Sign out and back in to refresh.');
  }

  return res;
}
