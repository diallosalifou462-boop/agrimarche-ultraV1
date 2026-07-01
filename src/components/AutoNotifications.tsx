// components/AutoNotifications.tsx
'use client';

import { useEffect } from 'react';

export function AutoNotifications() {
  useEffect(() => {
    // Attendre que la page soit chargée
    const setupNotifications = async () => {
      try {
        // Vérifier si les notifications sont supportées
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
          console.log('Notifications non supportées');
          return;
        }

        // Si déjà autorisées, on s'abonne
        if (Notification.permission === 'granted') {
          await subscribeToPush();
          return;
        }

        // Si pas encore décidé, on demande automatiquement
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            await subscribeToPush();
          }
        }
        
        // Si refusé, on ne fait rien
      } catch (error) {
        console.error('Erreur notification:', error);
      }
    };

    const subscribeToPush = async () => {
      const registration = await navigator.serviceWorker.ready;
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      });
      
      await fetch('/api/notify/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
          userId: localStorage.getItem('userId') || 'anonymous'
        })
      });
      
      console.log('✅ Notifications activées automatiquement');
    };

    setupNotifications();
  }, []);

  return null; // Ce composant n'affiche rien
}
