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

function getNativePlatformName(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  return ((window as any).Capacitor?.getPlatform?.() as 'ios' | 'android') ?? 'web';
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
        // ⚠️ FIX : on utilise désormais @capacitor-firebase/messaging plutôt que
        // @capacitor/push-notifications pour interroger le statut de permission
        // ET pour obtenir le token. @capacitor/push-notifications renvoie, sur
        // iOS, le token APNs BRUT (pas un token FCM) — Firebase Admin SDK rejette
        // ces tokens silencieusement côté /api/send-push. @capacitor-firebase/
        // messaging fait le pont natif APNs → FCM en interne et renvoie un vrai
        // token FCM, sur iOS comme sur Android.
        try {
          const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

          // ⚠️ CRITIQUE Android 8+ : /api/send-push envoie toujours un channelId
          // explicite ("agrimarche_default" / "agrimarche_urgent"). Si ce canal
          // n'existe pas nativement au moment où la notif arrive (app en fond ou
          // fermée), Android la JETTE SILENCIEUSEMENT — pas d'erreur, rien dans
          // les logs FCM (qui reportent success=true côté serveur quand même).
          // On crée les deux canaux ici, au tout premier lancement natif, pour
          // ne plus dépendre d'une config manifeste/native manquante. No-op sur
          // iOS et sans effet si le canal existe déjà (createChannel est idempotent).
          if (getNativePlatformName() === 'android') {
            const channels: Array<{ id: string; name: string; importance: number; visibility: number; vibration: boolean }> = [
              { id: 'agrimarche_default', name: 'Notifications AgriMarché', importance: 4, visibility: 1, vibration: true },
              { id: 'agrimarche_urgent', name: 'Alertes urgentes AgriMarché', importance: 5, visibility: 1, vibration: true },
            ];
            await Promise.all(
              channels.map((c) =>
                FirebaseMessaging.createChannel({
                  id: c.id,
                  name: c.name,
                  importance: c.importance as any,
                  visibility: c.visibility as any,
                  vibration: c.vibration,
                  sound: 'default',
                }).catch((err) => console.warn(`[FCM] Échec création canal Android "${c.id}":`, err))
              )
            );
          }

          const status = await FirebaseMessaging.checkPermissions();
          setPermission(
            status.receive === 'granted'
              ? 'granted'
              : status.receive === 'denied'
              ? 'denied'
              : 'default'
          );
          setIsSupportedBrowser(false);
        } catch (err) {
          console.warn('@capacitor-firebase/messaging non installé ou indisponible:', err);
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
      if (!user) {
        console.log('Token obtenu mais aucun utilisateur connecté.');
        return;
      }
      const tokenRef = doc(db, 'users', user.uid, 'tokens', fcmToken);
      await setDoc(tokenRef, {
        token: fcmToken,
        createdAt: new Date(),
        platform,
        ...(typeof navigator !== 'undefined'
          ? { userAgent: navigator.userAgent }
          : {}),
      });
    },
    [user]
  );

  // Brancher les listeners Firebase Messaging natifs (natif uniquement)
  useEffect(() => {
    if (!isNative || !user) return;

    let tokenListener: any;
    let notificationListener: any;

    const setupNativePush = async () => {
      try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

        // Émis quand un token FCM est généré ou rafraîchi par le SDK natif.
        tokenListener = await FirebaseMessaging.addListener(
          'tokenReceived',
          async (tokenData) => {
            setToken(tokenData.token);
            setPermission('granted');
            await saveTokenToFirestore(tokenData.token, getNativePlatformName());
          }
        );

        notificationListener = await FirebaseMessaging.addListener(
          'notificationReceived',
          (event) => {
            if (messageCallbackRef.current) {
              // On reformate au même shape que le payload FCM web pour rester compatible
              messageCallbackRef.current({
                notification: {
                  title: event.notification?.title,
                  body: event.notification?.body,
                },
                data: event.notification?.data,
              });
            }
          }
        );
      } catch (err) {
        console.warn("Impossible d'initialiser FirebaseMessaging natif:", err);
      }
    };

    setupNativePush();

    return () => {
      tokenListener?.remove?.();
      notificationListener?.remove?.();
    };
  }, [isNative, user, saveTokenToFirestore]);

  // Demander la permission et obtenir le token
  const requestPermission = useCallback(async (): Promise<string | null> => {
    if (!user) {
      console.warn('Utilisateur non connecté. Le token sera enregistré plus tard.');
      return null;
    }

    // --- Branche native (Android/iOS via Capacitor) ---
    if (isNative) {
      try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        const status = await FirebaseMessaging.checkPermissions();
        let finalStatus = status.receive;

        if (finalStatus === 'prompt' || finalStatus === 'prompt-with-rationale') {
          const requested = await FirebaseMessaging.requestPermissions();
          finalStatus = requested.receive;
        }

        if (finalStatus !== 'granted') {
          setPermission('denied');
          console.warn('Permission push refusée (natif)');
          return null;
        }

        setPermission('granted');

        // getToken() effectue lui-même, sur iOS, l'enregistrement APNs puis le
        // pont vers Firebase — pas besoin d'appeler register() séparément ni
        // de bridger manuellement le device token dans l'AppDelegate.
        const { token: fcmToken } = await FirebaseMessaging.getToken();
        if (fcmToken) {
          setToken(fcmToken);
          await saveTokenToFirestore(fcmToken, getNativePlatformName());
          return fcmToken;
        }
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
      setPermission(perm);

      if (perm !== 'granted') {
        console.warn('Permission non accordée');
        return null;
      }

      await navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[FCM] Échec enregistrement du Service Worker:', err);
      });
      const swRegistration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('serviceWorker.ready timeout')), 8000),
        ),
      ]);
      const messaging = getMessaging();
      const fcmToken = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (fcmToken) {
        await saveTokenToFirestore(fcmToken, 'web');
        setToken(fcmToken);
        return fcmToken;
      } else {
        console.warn("Impossible d'obtenir le token FCM");
        return null;
      }
    } catch (error) {
      console.error('Erreur lors de la demande de permission:', error);
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
          const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
          await FirebaseMessaging.deleteToken();
        } catch (err) {
          console.warn('Erreur suppression token push natif:', err);
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
        // Le listener natif est déjà branché dans le useEffect ci-dessus
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
