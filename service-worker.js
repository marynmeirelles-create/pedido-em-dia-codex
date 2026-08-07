const CACHE_NAME = "pedido-em-dia-v47";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=47",
  "./layout-fix.css?v=47",
  "./script.js?v=47",
  "./compat-fix.js?v=47",
  "./db.js?v=47",
  "./backup.js?v=47",
  "./manifest.json?v=47",
  "./assets/pedido-em-dia-logo.png",
  "./assets/pedido-em-dia-logo-transparent.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/app-icon-master.png",
  "./assets/logo.svg",
  "./assets/icon.svg",
  "./assets/favicon.png"
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

















