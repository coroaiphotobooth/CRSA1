const CACHE_NAME = 'coroai-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple fetch handler to pass PWA installability requirements
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Offline content not available');
    })
  );
});
