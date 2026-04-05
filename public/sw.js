// Minimal service worker for PWA install eligibility
// No caching — just satisfies Chrome's install criteria

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
