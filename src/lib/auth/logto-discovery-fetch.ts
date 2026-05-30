/**
 * Discovery-rewriting fetch for the Castalia (Logto) OIDC provider.
 *
 * Logto's OIDC discovery document advertises
 * `authorization_response_iss_parameter_supported: true`, but Logto does NOT
 * actually emit the `iss` parameter on the authorization-response redirect.
 * Auth.js v5 (oauth4webapi) honours the advertised flag and enforces RFC-9207:
 *
 *   if (!iss && as.authorization_response_iss_parameter_supported)
 *     throw 'response parameter "iss" (issuer) missing'
 *
 * That makes every Castalia callback fail with CallbackRouteError →
 * `?error=Configuration`, breaking sign-in entirely. This wrapper intercepts
 * ONLY the discovery request and removes the offending flag, so `iss` becomes
 * optional. Token / userinfo / jwks requests pass through unchanged.
 *
 * Remove once the Castalia/Logto server emits `iss` (or stops advertising it).
 */

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

export function makeLogtoDiscoveryFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const res = await baseFetch(input as RequestInfo, init);
    if (!requestUrl(input).includes('/.well-known/openid-configuration') || !res.ok) {
      return res;
    }
    try {
      const meta = await res.clone().json();
      if (meta && typeof meta === 'object') {
        delete (meta as Record<string, unknown>).authorization_response_iss_parameter_supported;
        return Response.json(meta, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }
    } catch {
      // Non-JSON or parse failure — fall through with the original response.
    }
    return res;
  };
}
