import {
  cookieNamesFromHeader,
  countryFromHeaders,
  viewerKindFromCookies,
} from '../../lib/analytics/context';
import {
  deviceClass,
  referrerHost,
} from '../../lib/analytics/client-context';

describe('referrerHost', () => {
  it('reduces a referring URL to its host', () => {
    expect(referrerHost('https://news.ycombinator.com/item?id=1', 'liminalcalendar.com'))
      .toBe('news.ycombinator.com');
  });

  it('strips www so one source is one row', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'liminalcalendar.com'))
      .toBe('google.com');
  });

  it('never keeps the query string, which can carry search terms or tokens', () => {
    const host = referrerHost('https://mail.example.com/read?token=secret123', 'liminalcalendar.com');
    expect(host).toBe('mail.example.com');
    expect(host).not.toContain('secret123');
  });

  it('marks same-origin navigation as internal, not as a referrer', () => {
    expect(referrerHost('https://liminalcalendar.com/week', 'liminalcalendar.com')).toBe('(internal)');
    // www on either side still counts as the same site.
    expect(referrerHost('https://www.liminalcalendar.com/week', 'liminalcalendar.com')).toBe('(internal)');
  });

  it('reports no referrer as direct', () => {
    expect(referrerHost(undefined, 'liminalcalendar.com')).toBe('(direct)');
    expect(referrerHost('', 'liminalcalendar.com')).toBe('(direct)');
  });

  it('treats an unparseable referrer as direct rather than throwing', () => {
    expect(referrerHost('not a url', 'liminalcalendar.com')).toBe('(direct)');
  });
});

describe('deviceClass', () => {
  it('buckets by viewport width, with no user-agent sniffing', () => {
    expect(deviceClass(390)).toBe('mobile');
    expect(deviceClass(639)).toBe('mobile');
    expect(deviceClass(640)).toBe('tablet');
    expect(deviceClass(1023)).toBe('tablet');
    expect(deviceClass(1024)).toBe('desktop');
    expect(deviceClass(2560)).toBe('desktop');
  });

  it('defaults to mobile when width is unknown', () => {
    expect(deviceClass(undefined)).toBe('mobile');
    expect(deviceClass(0)).toBe('mobile');
  });
});

describe('cookieNamesFromHeader', () => {
  it('returns names only, never values', () => {
    const names = cookieNamesFromHeader('__session=abc.def; liminal_guest=1; other=x');
    expect(names).toEqual(['__session', 'liminal_guest', 'other']);
    expect(names.join()).not.toContain('abc.def');
  });

  it('handles an absent or empty header', () => {
    expect(cookieNamesFromHeader(null)).toEqual([]);
    expect(cookieNamesFromHeader('')).toEqual([]);
  });
});

describe('viewerKindFromCookies', () => {
  it('recognizes a signed-in visitor from session cookie presence', () => {
    expect(viewerKindFromCookies(['__session'], false)).toBe('member');
    expect(viewerKindFromCookies(['authjs.session-token'], false)).toBe('member');
    expect(viewerKindFromCookies(['__Secure-authjs.session-token'], false)).toBe('member');
    expect(viewerKindFromCookies(['__clerk_db_jwt'], false)).toBe('member');
  });

  it('prefers member over guest when someone signed up after entering as a guest', () => {
    expect(viewerKindFromCookies(['__session', 'liminal_guest'], true)).toBe('member');
  });

  it('reports guest and anonymous otherwise', () => {
    expect(viewerKindFromCookies(['liminal_guest'], true)).toBe('guest');
    expect(viewerKindFromCookies([], false)).toBe('anonymous');
  });
});

describe('countryFromHeaders', () => {
  it('reads the country the platform edge already resolved', () => {
    expect(countryFromHeaders(new Headers({ 'x-vercel-ip-country': 'GB' }))).toBe('GB');
    expect(countryFromHeaders(new Headers({ 'cf-ipcountry': 'br' }))).toBe('BR');
  });

  it('returns null when absent or malformed, rather than storing junk', () => {
    expect(countryFromHeaders(new Headers())).toBeNull();
    expect(countryFromHeaders(new Headers({ 'x-vercel-ip-country': 'XYZ' }))).toBeNull();
    expect(countryFromHeaders(new Headers({ 'x-vercel-ip-country': '' }))).toBeNull();
  });
});
