const CACHE_NAME = 'coroai-pwa-v1';

self.addEventListener('install', (event) => {
  console.log('SW: Install event');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW: Activate event');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Chrome requires a fetch handler to be present for PWA installability
  event.respondWith(
    fetch(event.request).catch(() => {
      // Basic offline fallback
      return new Response('Offline content not available');
    })
  );
});
