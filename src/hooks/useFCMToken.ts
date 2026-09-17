'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from './useAuth';
import { pushDiag, maskToken } from '@/lib/pushDiagnostics';

// Détecte le contexte Capacitor (APK Android / iOS natif)
function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

function getNativePlatformName(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  return ((window as any).Capacitor?.getPlatform?.() as 'ios' | 'android') ?? 'web';
}

export const PENDING_FCM_TOKEN_KEY = 'agrimarche_pending_fcm_token';

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
              { id: 'agrimarche_default', name: 'Notifications SunuMëñëf', importance: 4, visibility: 1, vibration: true },
              { id: 'agrimarche_urgent', name: 'Alertes urgentes SunuMëñëf', importance: 5, visibility: 1, vibration: true },
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

  // Enregistrer le token dans Firestore.
  //
  // ⚠️ Le token FCM est lié à l'APPAREIL, pas au compte : on peut l'obtenir
  // avant toute connexion. Sans utilisateur, on l'écrit dans deviceTokens/
  // {token} (voir firestore.rules) plutôt que d'abandonner — et on note le
  // token en localStorage pour qu'AuthContext.migratePendingFcmToken()
  // puisse le rattacher à users/{uid}/tokens/{token} dès la connexion ou
  // l'inscription qui suit.
  const saveTokenToFirestore = useCallback(
    async (fcmToken: string, platform: string) => {
      const payload = {
        token: fcmToken,
        createdAt: new Date(),
        platform,
        ...(typeof navigator !== 'undefined'
          ? { userAgent: navigator.userAgent }
          : {}),
      };

      if (!user) {
        // ⚠️ FIX (16/09) : le localStorage est écrit AVANT Firestore. Avant,
        // si setDoc(deviceTokens) échouait (règle Firestore sans auth, réseau
        // coupé...), l'exception sortait avant cette ligne : le token n'était
        // jamais mémorisé, readPendingPushToken() renvoyait undefined et
        // registrationStart retombait TOUJOURS sur SMS.
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PENDING_FCM_TOKEN_KEY, JSON.stringify({ token: fcmToken, platform }));
          pushDiag('local_save', 'ok', 'Token mémorisé sur l’appareil (localStorage)');
        }
        try {
          await setDoc(doc(db, 'deviceTokens', fcmToken), payload);
          pushDiag('firestore_save', 'ok', 'Token enregistré dans Firestore (deviceTokens)');
        } catch (err) {
          console.warn('[FCM] Écriture deviceTokens refusée (token gardé en local):', err);
          // Non bloquant pour l'OTP : le token part au serveur depuis le localStorage.
          pushDiag('firestore_save', 'warn', 'Firestore refuse deviceTokens (non bloquant pour l’OTP, vérifier firestore.rules)', err);
        }
        return;
      }

      const tokenRef = doc(db, 'users', user.uid, 'tokens', fcmToken);
      await setDoc(tokenRef, payload);
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

  // Demander la permission et obtenir le token.
  // ⚠️ Fonctionne désormais SANS utilisateur connecté (token pré-inscription,
  // voir saveTokenToFirestore ci-dessus) — c'est le but recherché.
  const requestPermission = useCallback(async (): Promise<string | null> => {
    // ⚠️ FIX (16/09) — CAUSE PRINCIPALE du "push jamais utilisé" :
    // `isNative` et `isSupportedBrowser` sont des états remplis de façon
    // ASYNCHRONE par checkSupport(). La page d'inscription appelle
    // requestPermission() dès le montage, donc AVANT que ces états passent
    // à true : on tombait dans la branche web, `!isSupportedBrowser` était
    // vrai, et la fonction renvoyait null sans même demander le token — sur
    // l'APK comme sur le web. On détecte désormais le contexte au moment de
    // l'appel, sans dépendre de l'état React.
    const nativeNow = isNative || isNativePlatform();
    pushDiag('platform', 'info', `Plateforme détectée : ${nativeNow ? getNativePlatformName() : 'web'}`);

    // --- Branche native (Android/iOS via Capacitor) ---
    if (nativeNow) {
      try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        const status = await FirebaseMessaging.checkPermissions();
        let finalStatus = status.receive;

        if (finalStatus === 'prompt' || finalStatus === 'prompt-with-rationale') {
          const requested = await FirebaseMessaging.requestPermissions();
          finalStatus = requested.receive;
        }

        pushDiag('permission', finalStatus === 'granted' ? 'ok' : 'error', `Permission notifications : ${finalStatus}`);
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
          pushDiag('token', 'ok', 'Token FCM obtenu', maskToken(fcmToken));
          setToken(fcmToken);
          await saveTokenToFirestore(fcmToken, getNativePlatformName());
          return fcmToken;
        }
        pushDiag('token_error', 'error', 'getToken() a répondu sans token', 'token vide');
        return null;
      } catch (err) {
        console.error('Erreur demande permission push native:', err);
        pushDiag('token_error', 'error', 'Échec obtention du token (natif)', err);
        return null;
      }
    }

    // --- Branche web ---
    const supportedNow = isSupportedBrowser || (await isSupported().catch(() => false));
    if (!supportedNow || typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('Notifications non supportées sur ce navigateur');
      pushDiag('token_error', 'error', 'Navigateur sans support des notifications push', 'not available');
      return null;
    }

    if (Notification.permission === 'denied') {
      pushDiag('permission', 'error', 'Permission notifications : denied (navigateur)');
      console.warn("Permission refusée par l'utilisateur");
      return null;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      pushDiag('permission', perm === 'granted' ? 'ok' : 'error', `Permission notifications : ${perm}`);

      if (perm !== 'granted') {
        console.warn('Permission non accordée');
        return null;
      }

      await navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[FCM] Échec enregistrement du Service Worker:', err);
        pushDiag('token_error', 'warn', 'Service worker non enregistré', err);
      });
      if (!process.env.NEXT_PUBLIC_VAPID_KEY) {
        // Non bloquant : Firebase utilise alors une clé par défaut, mais il
        // est recommandé de configurer la clé du projet.
        pushDiag('platform', 'warn', 'NEXT_PUBLIC_VAPID_KEY manquante (clé par défaut utilisée, à configurer)');
      }
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
        pushDiag('token', 'ok', 'Token FCM web obtenu', maskToken(fcmToken));
        await saveTokenToFirestore(fcmToken, 'web');
        setToken(fcmToken);
        return fcmToken;
      } else {
        console.warn("Impossible d'obtenir le token FCM");
        pushDiag('token_error', 'error', 'getToken() web a répondu sans token', 'token vide');
        return null;
      }
    } catch (error) {
      console.error('Erreur lors de la demande de permission:', error);
      pushDiag('token_error', 'error', 'Échec obtention du token (web)', error);
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
