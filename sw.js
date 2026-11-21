/* =====================================================================
   Service worker: saves the app on the phone so it opens with no internet.

   - Our own files: network first (so updates arrive), saved copy when offline.
   - Map library and fonts from the internet: saved the first time, then reused.

   When you change any file, change CACHE_NAME below (v1 -> v2) so phones refresh.
   ===================================================================== */

const CACHE_NAME = "sac-map-v4";

// Our files (relative to this file)
const OWN_FILES = [
  "./", "index.html", "style.css", "manifest.webmanifest",
  "plan-image.js", "plan-image-clean.js", "data.js", "plan.js", "graph.js", "map3d.js", "ar.js", "zone.js", "app.js",
  "icon-192.png", "icon-512.png"
];

// Files from the internet that the page needs (saved on the first visit)
const OUTSIDE_FILES = [
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(OWN_FILES);
    // One by one, so a single failure does not stop the install
    await Promise.all(OUTSIDE_FILES.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.protocol !== "https:" && url.hostname !== "localhost") return;

  const isOwn = url.origin === self.location.origin;
  event.respondWith(isOwn ? networkFirst(request) : cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    if (request.mode === "navigate") return cache.match("index.html");
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const saved = await cache.match(request);
  if (saved) return saved;
  const fresh = await fetch(request);                         // may fail offline: the page then loads without it
  if (fresh.ok || fresh.type === "opaque") cache.put(request, fresh.clone());
  return fresh;
}