const CACHE_NAME = "agrimarche-v2";

const ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/favicon.ico",
];

// Installation
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activation
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Requêtes
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy);
        });

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);

        if (cached) {
          return cached;
        }

        if (event.request.mode === "navigate") {
          return caches.match("/offline.html");
        }
      })
  );
});

// Notifications Push
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {
    title: "AgriMarché",
    body: "Nouvelle notification",
    url: "/",
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-72.png",
      badge: "/icon-72.png",
      data: {
        url: data.url || "/",
      },
    })
  );
});

// Clic sur la notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});