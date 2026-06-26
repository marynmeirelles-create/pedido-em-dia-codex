const CACHE_NAME = "atelie-em-dia-v24";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=24",
  "./script.js?v=24",
  "./db.js?v=24",
  "./backup.js?v=24",
  "./manifest.json?v=24",
  "./assets/atelie-em-dia-logo.png",
  "./assets/atelie-em-dia-logo-transparent.png",
  "./assets/logo.svg",
  "./assets/icon.svg",
  "./assets/favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => caches.match("./index.html")))
  );
});
