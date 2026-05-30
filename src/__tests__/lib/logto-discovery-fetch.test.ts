/**
 * @jest-environment node
 */
import { makeLogtoDiscoveryFetch } from '@/lib/auth/logto-discovery-fetch';

const DISCOVERY_URL = 'https://id.castalia.one/oidc/.well-known/openid-configuration';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('makeLogtoDiscoveryFetch', () => {
  it('strips authorization_response_iss_parameter_supported from the discovery doc', async () => {
    const base = jest.fn(async () =>
      jsonResponse({
        issuer: 'https://id.castalia.one/oidc',
        authorization_endpoint: 'https://id.castalia.one/oidc/auth',
        authorization_response_iss_parameter_supported: true,
      }),
    ) as unknown as typeof fetch;

    const wrapped = makeLogtoDiscoveryFetch(base);
    const res = await wrapped(DISCOVERY_URL);
    const meta = await res.json();

    expect('authorization_response_iss_parameter_supported' in meta).toBe(false);
    // Other metadata is preserved.
    expect(meta.issuer).toBe('https://id.castalia.one/oidc');
    expect(meta.authorization_endpoint).toBe('https://id.castalia.one/oidc/auth');
  });

  it('passes non-discovery requests through untouched', async () => {
    const tokenBody = { access_token: 'abc', id_token: 'xyz' };
    const base = jest.fn(async () => jsonResponse(tokenBody)) as unknown as typeof fetch;

    const wrapped = makeLogtoDiscoveryFetch(base);
    const res = await wrapped('https://id.castalia.one/oidc/token', { method: 'POST' });
    const body = await res.json();

    expect(body).toEqual(tokenBody);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('does not alter a non-ok discovery response', async () => {
    const base = jest.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const wrapped = makeLogtoDiscoveryFetch(base);
    const res = await wrapped(DISCOVERY_URL);
    expect(res.status).toBe(500);
  });

  it('accepts URL and Request inputs', async () => {
    const base = jest.fn(async () =>
      jsonResponse({ issuer: 'x', authorization_response_iss_parameter_supported: true }),
    ) as unknown as typeof fetch;
    const wrapped = makeLogtoDiscoveryFetch(base);

    const viaUrl = await (await wrapped(new URL(DISCOVERY_URL))).json();
    expect('authorization_response_iss_parameter_supported' in viaUrl).toBe(false);

    const viaRequest = await (await wrapped(new Request(DISCOVERY_URL))).json();
    expect('authorization_response_iss_parameter_supported' in viaRequest).toBe(false);
  });
});
