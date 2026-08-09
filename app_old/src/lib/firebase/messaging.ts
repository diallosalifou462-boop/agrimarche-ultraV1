// lib/firebase/messaging.ts

import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

// 1. Demander la permission à l'utilisateur
export const requestNotificationPermission = async (userId: string) => {
  // Vérifier si le navigateur supporte les notifications
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) return null;
  if (!('serviceWorker' in navigator)) return null;

  try {
    // Demander l'autorisation
    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      console.log('Permission non accordée');
      return null;
    }

    // Récupérer le service worker
    const swRegistration = await navigator.serviceWorker.ready;
    
    // Obtenir le messaging
    const messaging = getMessaging();
    
    // Obtenir le token
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
    
    // Sauvegarder le token dans Firestore
    await setDoc(doc(db, 'users', userId, 'tokens', token), {
      token,
      createdAt: new Date(),
      userAgent: navigator.userAgent,
    });
    
    console.log('✅ Token enregistré:', token);
    return token;
    
  } catch (error) {
    console.error('❌ Erreur permission:', error);
    return null;
  }
};

// 2. Écouter les notifications quand le site est ouvert
export const onMessageListener = () =>
  new Promise((resolve) => {
    const messaging = getMessaging();
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
