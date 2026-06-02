// Service worker with push notification support + app-shell precache.

// Bump this to force-evict the old cache after changing what/how we cache.
const CACHE_VERSION = 'liminal-calendar-static-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache that isn't the current version (clears stale builds).
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Cache-first for content-hashed static assets ONLY. Everything else
// (navigations/HTML, /api, /ws, OAuth/OIDC, manifest, sw.js, non-GET) is NOT
// intercepted — we don't call respondWith, so the browser handles it natively.
// This is deliberate: a blanket `respondWith(fetch(req))` passthrough drops
// Set-Cookie on Chrome OAuth 302 callbacks. Hashed filenames mean cache-first
// can never serve a stale build — a new build = a new URL.
function isCacheable(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||           // Next.js hashed bundle
    /\.(woff2|woff|ttf)$/.test(url.pathname) ||             // fonts
    /^\/(icon-192|icon-512)\.png$/.test(url.pathname) ||    // PWA icons
    url.pathname === '/favicon.svg'                         // brand favicon
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                  // never touch POST/PUT/etc.
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;   // leave third-party alone
  if (!isCacheable(url)) return;                      // navigations, /api, oauth → native

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;                            // instant: no network on repeat launch
      const res = await fetch(req);
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    })()
  );
});

// Recovery path: clear the cache on demand (belt-and-suspenders kill switch).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PURGE') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});

// Handle incoming push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const actions = data.eventId
      ? [{ action: 'mute', title: '🔕 Mute series' }]
      : [];
    const options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'calendar-reminder',
      renotify: true,
      actions,
      data: { url: data.url || '/', eventId: data.eventId },
    };
    event.waitUntil(self.registration.showNotification(data.title || 'Liminal Calendar', options));
  } catch (e) {
    // Fallback for non-JSON payloads
    event.waitUntil(
      self.registration.showNotification('Liminal Calendar', {
        body: event.data.text(),
        icon: '/icon-192.png',
      })
    );
  }
});

function broadcastMuteChange(eventId, muted) {
  try {
    const ch = new BroadcastChannel('liminal-mute');
    ch.postMessage({ eventId, muted });
    ch.close();
  } catch {
    // BroadcastChannel unsupported — no-op
  }
}

async function focusOrOpenCalendar(url) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    if (
      client.url.includes('liminalcalendar.com') ||
      client.url.includes('calendar.castalia.one') ||
      client.url.includes('localhost')
    ) {
      try { await client.navigate(url); } catch {}
      return client.focus();
    }
  }
  return self.clients.openWindow(url);
}

async function handleMuteAction(eventId) {
  try {
    const res = await fetch(`/api/events/${eventId}/mute`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.ok) {
      broadcastMuteChange(eventId, true);
      await self.registration.showNotification('Series muted', {
        body: 'You won’t get reminders for this series. Unmute anytime in Settings → Notifications.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `mute-confirm-${eventId}`,
        data: { url: '/settings', eventId, unmuteAction: true },
        actions: [{ action: 'unmute', title: '↩ Undo' }],
      });
      // Surface the calendar so the user sees the event immediately dimmed
      // (broadcast already updated state in any open tab).
      await focusOrOpenCalendar('/');
    }
  } catch {
    // network blip — silent
  }
}

async function handleUnmuteAction(eventId) {
  try {
    const res = await fetch(`/api/events/${eventId}/mute`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      broadcastMuteChange(eventId, false);
      await self.registration.showNotification('Unmuted', {
        body: 'Reminders restored for this series.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `unmute-confirm-${eventId}`,
        data: { url: '/' },
      });
      await focusOrOpenCalendar('/');
    }
  } catch {
    // silent
  }
}

// Handle notification click — open the event/meeting link, mute, or unmute
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === 'mute' && data.eventId) {
    event.waitUntil(handleMuteAction(data.eventId));
    return;
  }

  if (event.action === 'unmute' && data.eventId) {
    event.waitUntil(handleUnmuteAction(data.eventId));
    return;
  }

  const url = data.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('liminalcalendar.com') || client.url.includes('calendar.castalia.one') || client.url.includes('localhost')) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
