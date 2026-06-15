// firebase-messaging-sw.js
// Service Worker pour les notifications push

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Configuration Firebase (depuis ton fichier lib/firebase/firebase.ts)
firebase.initializeApp({
  apiKey: "AIzaSyD9HHxhbNvOQizx7Qbp4JVSThFW1OyTO_A",
  authDomain: "agrimarche-24e37.firebaseapp.com",
  projectId: "agrimarche-24e37",
  storageBucket: "agrimarche-24e37.appspot.com",
  messagingSenderId: "21462709831",
  appId: "1:21462709831:web:e82e3b09279ac7584ba362",
  measurementId: "G-0L41S1RHWZ",
});

const messaging = firebase.messaging();

// Gestion des notifications en arrière-plan
messaging.onBackgroundMessage((payload) => {
  console.log('[Service Worker] Notification reçue:', payload);

  const notificationTitle = payload.notification?.title || 'AgriMarché';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/logo.png',
    badge: '/badge.png',
    vibrate: [200, 100, 200],
    data: {
      link: payload.data?.link || '/',
      type: payload.data?.type || 'info',
    },
    actions: [
      { action: 'open', title: 'Voir' },
      { action: 'close', title: 'Fermer' },
    ],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Gestion du clic sur la notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const link = event.notification.data?.link || '/';
  const action = event.action;

  if (action === 'open' || !action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(() => client.navigate(link));
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(link);
        }
      })
    );
  }
});