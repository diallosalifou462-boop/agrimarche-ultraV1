'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from './useAuth';

// Détecte le contexte Capacitor (APK Android / iOS natif)
function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

export function useFCMToken() {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [loading, setLoading] = useState(true);
  const messageCallbackRef = useRef<((payload: any) => void) | null>(null);

  // Vérifier le contexte (natif vs navigateur) et le support
  useEffect(() => {
    const checkSupport = async () => {
      const native = isNativePlatform();
      setIsNative(native);

      if (native) {
        // Sur natif, on délègue le statut de permission à Capacitor
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          const status = await PushNotifications.checkPermissions();
          setPermission(
            status.receive === 'granted'
              ? 'granted'
              : status.receive === 'denied'
              ? 'denied'
              : 'default'
          );
          setIsSupportedBrowser(false);
        } catch (err) {
          console.warn('@capacitor/push-notifications non installé ou indisponible:', err);
        }
        setLoading(false);
        return;
      }

      const supported = await isSupported();
      setIsSupportedBrowser(supported);
      if (supported && typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission);
      }
      setLoading(false);
    };
    checkSupport();
  }, []);

  // Enregistrer le token natif dans Firestore
  const saveTokenToFirestore = useCallback(
    async (fcmToken: string, platform: string) => {
      if (!user) return;
      const tokenRef = doc(db, 'users', user.uid, 'tokens', fcmToken);
      await setDoc(tokenRef, {
        token: fcmToken,
        createdAt: new Date(),
        platform,
        ...(typeof navigator !== 'undefined' ? { userAgent: navigator.userAgent } : {}),
      });
    },
    [user]
  );

  // Brancher les listeners Capacitor une fois pour toutes (natif uniquement)
  useEffect(() => {
    if (!isNative || !user) return;

    let registrationListener: any;
    let errorListener: any;
    let receivedListener: any;

    const setupNativePush = async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        registrationListener = await PushNotifications.addListener(
          'registration',
          async (tokenData) => {
            setToken(tokenData.value);
            setPermission('granted');
            await saveTokenToFirestore(tokenData.value, 'android');
          }
        );

        errorListener = await PushNotifications.addListener('registrationError', (err) => {
          console.error('Erreur enregistrement push natif:', err);
        });

        receivedListener = await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            if (messageCallbackRef.current) {
              // On reformate au même shape que le payload FCM web pour rester compatible
              messageCallbackRef.current({
                notification: {
                  title: notification.title,
                  body: notification.body,
                },
                data: notification.data,
              });
            }
          }
        );
      } catch (err) {
        console.warn("Impossible d'initialiser PushNotifications:", err);
      }
    };

    setupNativePush();

    return () => {
      registrationListener?.remove?.();
      errorListener?.remove?.();
      receivedListener?.remove?.();
    };
  }, [isNative, user, saveTokenToFirestore]);

  // Demander la permission et obtenir le token
  const requestPermission = useCallback(async (): Promise<string | null> => {
    if (!user) {
      console.warn('Utilisateur non connecté');
      return null;
    }
console.log("FCM STEP 1 - requestPermission lancé");
    // --- Branche native (Android/iOS via Capacitor) ---
    if (isNative) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const status = await PushNotifications.checkPermissions();
        let finalStatus = status.receive;

        if (finalStatus === 'prompt' || finalStatus === 'prompt-with-rationale') {
          const requested = await PushNotifications.requestPermissions();
          finalStatus = requested.receive;
        }

        if (finalStatus !== 'granted') {
          setPermission('denied');
          console.warn('Permission push refusée (natif)');
          return null;
        }

        setPermission('granted');
        await PushNotifications.register();
        // Le token arrive de façon asynchrone via le listener 'registration' ci-dessus
        return null;
      } catch (err) {
        console.error('Erreur demande permission push native:', err);
        return null;
      }
    }

    // --- Branche web (inchangée) ---
    if (!isSupportedBrowser) {
      console.warn('Notifications non supportées sur ce navigateur');
      return null;
    }

    if (Notification.permission === 'denied') {
      console.warn("Permission refusée par l'utilisateur");
      return null;
    }

    try {
      const perm = await Notification.requestPermission();
      console.log("FCM STEP 3 - service worker prêt");
      setPermission(perm);

      if (perm !== 'granted') {
        console.warn('Permission non accordée');
        return null;
      }

      const swRegistration = await navigator.serviceWorker.ready;
      console.log("FCM STEP 4 - demande token");
      const messaging = getMessaging();
      console.log("FCM STEP 4 - demande token");
      const fcmToken = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });
console.log("FCM STEP 5 - token =", fcmToken);
      if (fcmToken) {
        await saveTokenToFirestore(fcmToken, 'web');
        setToken(fcmToken);
        return fcmToken;
      } else {
        console.warn("Impossible d'obtenir le token FCM");
        return null;
      }
    } catch (error) {
      console.error('FCM ERROR =', error);
      return null;
    }
  }, [isNative, isSupportedBrowser, user, saveTokenToFirestore]);

  // Supprimer le token (déconnexion)
  const revokeToken = useCallback(async () => {
    if (!token || !user) return;

    try {
      const tokenRef = doc(db, 'users', user.uid, 'tokens', token);
      await deleteDoc(tokenRef);
      setToken(null);

      if (isNative) {
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          await PushNotifications.unregister();
        } catch (err) {
          console.warn('Erreur unregister push natif:', err);
        }
      }
    } catch (error) {
      console.error('Erreur suppression token:', error);
    }
  }, [token, user, isNative]);

  // Écouter les messages reçus (web et natif, même interface)
  const onMessageReceived = useCallback(
    (callback: (payload: any) => void) => {
      messageCallbackRef.current = callback;

      if (isNative) {
        // Le listener Capacitor est déjà branché dans le useEffect ci-dessus
        return () => {
          messageCallbackRef.current = null;
        };
      }

      if (!isSupportedBrowser) return () => {};

      const messaging = getMessaging();
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Message reçu en premier plan:', payload);
        callback(payload);
      });

      return () => {
        unsubscribe();
        messageCallbackRef.current = null;
      };
    },
    [isNative, isSupportedBrowser]
  );

  return {
    token,
    permission,
    isSupported: isSupportedBrowser || isNative,
    loading,
    requestPermission,
    revokeToken,
    onMessageReceived,
  };
}
