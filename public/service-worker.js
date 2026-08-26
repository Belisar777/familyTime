const CACHE_NAME = 'familytimes-shell-v1';
const APP_SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((cacheNames) => Promise.all(cacheNames.filter((cacheName) => cacheName !== CACHE_NAME).map((cacheName) => caches.delete(cacheName)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.endsWith('.ics')) return;

  event.respondWith(fetch(event.request).then((response) => {
    const responseCopy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
    return response;
  }).catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match('/index.html'))));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    const existingClient = windowClients.find((client) => new URL(client.url).origin === self.location.origin);
    return existingClient ? existingClient.focus() : clients.openWindow('/#today');
  }));
});
