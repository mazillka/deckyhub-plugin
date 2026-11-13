// The Paired devices page as an installed app. The page itself always comes from the network when it can
// (so a new version is never held back); the copy kept here only lets the app open without a connection.
// It never touches the device: the pairing and every request live in the page, not here.
const CACHE = 'deckyhub-paired-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    } catch {
      return (await caches.match(request, { ignoreSearch: true })) || Response.error();
    }
  })());
});

// Tapping an update notice brings the app forward.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => client.url.startsWith(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow(self.registration.scope);
  })());
});
