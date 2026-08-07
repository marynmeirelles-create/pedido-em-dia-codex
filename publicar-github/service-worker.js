const CACHE_NAME = "pedido-em-dia-v45";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=45",
  "./layout-fix.css?v=45",
  "./script.js?v=45",
  "./compat-fix.js?v=45",
  "./db.js?v=45",
  "./backup.js?v=45",
  "./manifest.json?v=45",
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















