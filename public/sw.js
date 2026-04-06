// Minimal service worker for PWA install eligibility
// No caching — just satisfies Chrome's install criteria
// fetch handler passes through to network (required for PWA install)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
