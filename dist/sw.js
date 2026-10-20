/* Big Pickle Racing Tracker service worker.
 *
 * Strategy: NETWORK-FIRST for everything same-origin, with the cache as an
 * offline fallback. This deliberately cannot serve a stale bundle while the
 * phone is online, so it never fights the app's own update checker — at the
 * track with no signal, the last good version still loads.
 */
const CACHE = 'bpr-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only handle same-origin GETs; everything else (weather APIs, GitHub
  // raw files, token auth) goes straight through.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || Promise.reject(new Error('offline')))),
  );
});
