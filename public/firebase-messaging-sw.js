importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyD9HHxhbNvOQizx7Qbp4JVSThFW1OyTO_A',
  authDomain: 'agrimarche-24e37.firebaseapp.com',
  projectId: 'agrimarche-24e37',
  storageBucket: 'agrimarche-24e37.appspot.com',
  messagingSenderId: '21462709831',
  appId: '1:21462709831:web:e82e3b09279ac7584ba362',
});

const messaging = firebase.messaging();

// Notification reçue en arrière-plan
messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM] Message reçu en arrière-plan:', payload);

  const { title, body, icon } = payload.notification || {};

  self.registration.showNotification(title || 'AgriMarché', {
    body: body || '',
    icon: icon || '/logo.png',
    badge: '/logo.png',
    data: payload.data || {},
  });
});

// Clic sur la notification → ouvre l'app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});