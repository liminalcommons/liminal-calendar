// Service worker with push notification support

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
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

// Handle notification click — open the event/meeting link, or mute the series
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === 'mute' && data.eventId) {
    event.waitUntil(
      fetch(`/api/events/${data.eventId}/mute`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => {})
    );
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
