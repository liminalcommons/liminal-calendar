import { applyRedirectPolicy } from '@/lib/auth/redirect-policy';

describe('applyRedirectPolicy', () => {
  const authBase = 'https://auth.liminalcalendar.com';
  const apex = 'https://liminalcalendar.com/';

  it('returns relative urls resolved against baseUrl', () => {
    expect(applyRedirectPolicy({ url: '/dashboard', baseUrl: authBase })).toBe(
      'https://auth.liminalcalendar.com/dashboard',
    );
  });

  it('allows hops to the apex liminalcalendar.com host', () => {
    expect(applyRedirectPolicy({ url: apex, baseUrl: authBase })).toBe(apex);
  });

  it('allows hops to subdomains of liminalcalendar.com', () => {
    expect(
      applyRedirectPolicy({ url: 'https://app.liminalcalendar.com/x', baseUrl: authBase }),
    ).toBe('https://app.liminalcalendar.com/x');
  });

  it('keeps same-origin absolute urls', () => {
    expect(
      applyRedirectPolicy({
        url: 'https://auth.liminalcalendar.com/sign-in',
        baseUrl: authBase,
      }),
    ).toBe('https://auth.liminalcalendar.com/sign-in');
  });

  it('rejects foreign hosts and falls back to the apex', () => {
    expect(
      applyRedirectPolicy({ url: 'https://evil.example.com/steal', baseUrl: authBase }),
    ).toBe(apex);
  });

  it('rejects look-alike hosts (suffix-only match without leading dot)', () => {
    expect(
      applyRedirectPolicy({
        url: 'https://evilliminalcalendar.com/x',
        baseUrl: authBase,
      }),
    ).toBe(apex);
  });

  it('falls back to apex when url is unparseable', () => {
    expect(applyRedirectPolicy({ url: 'not-a-url', baseUrl: authBase })).toBe(apex);
  });
});
