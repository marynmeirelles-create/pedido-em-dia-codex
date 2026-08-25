const CACHE_NAME = "pedido-em-dia-v57";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=57",
  "./layout-fix.css?v=57",
  "./script.js?v=57",
  "./compat-fix.js?v=57",
  "./db.js?v=57",
  "./backup.js?v=57",
  "./manifest.json?v=57",
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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});



















