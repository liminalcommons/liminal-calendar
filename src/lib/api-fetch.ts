/**
 * Wrapper around fetch that handles 401 by redirecting to auth gateway.
 * Use this for all client-side API calls instead of raw fetch.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401 && typeof window !== 'undefined') {
    const gateway = process.env.NEXT_PUBLIC_AUTH_GATEWAY_URL || 'https://auth.castalia.one';
    window.location.href = `${gateway}/signin?callbackUrl=${encodeURIComponent(window.location.origin)}`;
    // Return a never-resolving promise so the caller doesn't continue
    return new Promise(() => {});
  }

  return res;
}
