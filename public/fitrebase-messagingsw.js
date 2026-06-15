// public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD9HHxhbNvOQizx7Qbp4JVSThFW1OyTO_A",
  authDomain: "agrimarche-24e37.firebaseapp.com",
  projectId: "agrimarche-24e37",
  storageBucket: "agrimarche-24e37.appspot.com",
  messagingSenderId: "21462709831",
  appId: "1:21462709831:web:e82e3b09279ac7584ba362",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Notification reçue en arrière-plan', payload);

  self.registration.showNotification(
    payload.notification?.title || 'Agrimarche',
    {
      body: payload.notification?.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
    }
  );
});