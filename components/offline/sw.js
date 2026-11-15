/* global self, caches */
// The service worker the precache plugin writes into the build (precache.ts fills the placeholder below with the game's
// cache prefix, the files to keep and their version). Install stores the files in the version's cache; a newer version
// waits until the page's Reload (register.ts applyUpdate) sends `skipWaiting`; activate deletes the older versions'
// caches of the same prefix. Every request for a stored file is answered from the cache, every navigation by the stored
// index.html.
const PRECACHE = /*PRECACHE*/ { prefix: 'kit-', version: 'unbuilt', files: [] } /*END*/;
const PREFIX = PRECACHE.prefix;
const CACHE = PREFIX + PRECACHE.version;
const SCOPE = self.registration.scope;
// One spelling per file: the path percent-encoded (`fonts/Name[wght].ttf` is requested as `%5Bwght%5D`).
const stored = (file) => new URL(encodeURI(file), SCOPE).href;
const canonical = (url) => {
  const u = new URL(url);
  return u.origin + encodeURI(decodeURI(u.pathname));
};
const INDEX = stored('index.html');
const STORED = new Set(PRECACHE.files.map(stored));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // past the HTTP cache: a stale file must not land in a new version
      .then((cache) => cache.addAll(PRECACHE.files.map((f) => new Request(stored(f), { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page's Reload (applyUpdate): the waiting version takes over (the page reloads on controllerchange).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skipWaiting') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate' && req.url.startsWith(SCOPE)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then((cache) => cache.match(INDEX, { ignoreVary: true }))
        .then((hit) => hit || fetch(req)),
    );
    return;
  }
  let key;
  try {
    key = canonical(req.url); // without the query and the hash
  } catch {
    return;
  }
  if (!STORED.has(key)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(key, { ignoreVary: true }))
      .then((hit) => hit || fetch(req)),
  );
});
