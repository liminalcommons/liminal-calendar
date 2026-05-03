const APEX_FALLBACK = 'https://liminalcalendar.com/';
const ROOT_HOST = 'liminalcalendar.com';

export function applyRedirectPolicy({ url, baseUrl }: { url: string; baseUrl: string }): string {
  if (url.startsWith('/')) return `${baseUrl}${url}`;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return APEX_FALLBACK;
  }
  const host = target.hostname;
  if (host === ROOT_HOST || host.endsWith(`.${ROOT_HOST}`)) return target.toString();
  return APEX_FALLBACK;
}
