'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from './useAuth';

export function useFCMToken() {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(false);
  const [loading, setLoading] = useState(true);

  // Vérifier si le navigateur supporte les notifications
  useEffect(() => {
    const checkSupport = async () => {
      const supported = await isSupported();
      setIsSupportedBrowser(supported);
      if (supported && typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission);
      }
      setLoading(false);
    };
    checkSupport();
  }, []);

  // Demander la permission et obtenir le token
  const requestPermission = useCallback(async (): Promise<string | null> => {
    if (!isSupportedBrowser) {
      console.warn('Notifications non supportées sur ce navigateur');
      return null;
    }

    if (!user) {
      console.warn('Utilisateur non connecté');
      return null;
    }

    if (Notification.permission === 'denied') {
      console.warn('Permission refusée par l\'utilisateur');
      return null;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        console.warn('Permission non accordée');
        return null;
      }

      const swRegistration = await navigator.serviceWorker.ready;
      const messaging = getMessaging();
      const fcmToken = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (fcmToken) {
        const tokenRef = doc(db, 'users', user.uid, 'tokens', fcmToken);
        await setDoc(tokenRef, {
          token: fcmToken,
          createdAt: new Date(),
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        });
        setToken(fcmToken);
        return fcmToken;
      } else {
        console.warn('Impossible d\'obtenir le token FCM');
        return null;
      }
    } catch (error) {
      console.error('Erreur lors de la demande de permission:', error);
      return null;
    }
  }, [isSupportedBrowser, user, db]);

  // Supprimer le token (déconnexion)
  const revokeToken = useCallback(async () => {
    if (!token || !user) return;

    try {
      const tokenRef = doc(db, 'users', user.uid, 'tokens', token);
      await deleteDoc(tokenRef);
      setToken(null);
    } catch (error) {
      console.error('Erreur suppression token:', error);
    }
  }, [token, user, db]);

  // Écouter les messages reçus
  const onMessageReceived = useCallback((callback: (payload: any) => void) => {
    if (!isSupportedBrowser) return () => {};

    const messaging = getMessaging();
    return onMessage(messaging, (payload) => {
      console.log('Message reçu en premier plan:', payload);
      callback(payload);
    });
  }, [isSupportedBrowser]);

  return {
    token,
    permission,
    isSupported: isSupportedBrowser,
    loading,
    requestPermission,
    revokeToken,
    onMessageReceived,
  };
}