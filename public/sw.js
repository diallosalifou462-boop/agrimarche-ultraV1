// public/sw.js
// Cache + Notifications push

// === PARTIE CACHE (ce que tu avais déjà) ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('agrimarche-v1').then((cache) =>
      cache.addAll(['/'])
    )
  );
});

// === PARTIE NOTIFICATIONS PUSH (ce qu'on ajoute) ===
self.addEventListener('push', (event) => {
  const data = event.data?.json() || { 
    title: 'Nouveau produit', 
    body: 'Un producteur a ajouté un nouveau produit',
    url: '/'
  };
  
  const options = {
    body: data.body,
    icon: '/icon-72.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    data: { 
      url: data.url || '/' 
    },
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});