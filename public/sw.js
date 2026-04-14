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
    const options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'calendar-reminder',
      renotify: true,
      data: { url: data.url || '/' },
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

// Handle notification click — open the event/meeting link
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if open
      for (const client of clients) {
        if (client.url.includes('calendar.castalia.one') || client.url.includes('localhost')) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open new tab
      return self.clients.openWindow(url);
    })
  );
});
