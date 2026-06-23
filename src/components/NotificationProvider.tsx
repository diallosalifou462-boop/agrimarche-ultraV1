'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { useFCMToken } from '@/hooks/useFCMToken';
import { useAuth } from '@/hooks/useAuth';
import { Bell, X, CheckCircle, Truck, MessageCircle, Star, AlertCircle } from 'lucide-react';
import {
  collection, query, where, onSnapshot, orderBy, limit,
  doc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'order' | 'shipping' | 'message' | 'review' | 'alert' | 'info';
  read: boolean;
  createdAt: Date;
  link?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  showNotification: (notif: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  requestPermission: () => Promise<void>;
  permission: NotificationPermission;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

// Clé localStorage — ne plus jamais réafficher le bouton custom (web) après une réponse/fermeture
const NOTIF_DISMISS_KEY = 'agrimarche_notif_dismissed_at';
// Clé séparée pour éviter de redéclencher la popup système native à chaque session
const NATIVE_PROMPT_KEY = 'agrimarche_native_push_prompted';

function hasUserDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(NOTIF_DISMISS_KEY) !== null;
  } catch {
    return false;
  }
}

function markDismissed() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIF_DISMISS_KEY, String(Date.now()));
  } catch {}
}

function hasNativePrompted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(NATIVE_PROMPT_KEY) !== null;
  } catch {
    return false;
  }
}

function markNativePrompted() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NATIVE_PROMPT_KEY, String(Date.now()));
  } catch {}
}

// Détecte si on tourne dans une WebView Capacitor (APK Android / iOS natif)
function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requestPermission: requestFCMToken, permission, onMessageReceived } = useFCMToken();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [showNotifButton, setShowNotifButton] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const nativeRequestedRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);

    // Le bridge Capacitor peut s'injecter avec un léger délai au démarrage froid
    const checkNative = () => setIsNative(isNativePlatform());
    checkNative();
    const retry = setTimeout(checkNative, 300);

    if (!isNativePlatform() && !hasUserDismissed()) {
      setShowNotifButton(true); // fallback web uniquement
    }

    return () => clearTimeout(retry);
  }, []);

  // Déclenche automatiquement la popup système native — une seule fois par installation,
  // dès que l'utilisateur est connecté. Remplace le bouton custom côté natif.
  useEffect(() => {
    if (!isNative || !user) return;
    if (nativeRequestedRef.current || hasNativePrompted()) return;
    if (permission !== 'default') return; // déjà répondu (granted/denied) côté natif

    nativeRequestedRef.current = true;
    markNativePrompted();
    requestFCMToken();
  }, [isNative, user, permission, requestFCMToken]);

  // Écouter les notifications Firestore en temps réel
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as Notification[];
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [user]);

  // Écouter les messages en temps réel
  useEffect(() => {
    const unsubscribe = onMessageReceived((payload) => {
      const newNotification: Notification = {
        id: Date.now().toString(),
        title: payload.notification?.title || 'Notification',
        body: payload.notification?.body || '',
        type: payload.data?.type || 'info',
        read: false,
        createdAt: new Date(),
        link: payload.data?.link,
      };

      setNotifications((prev) => [newNotification, ...prev]);

      if (
        !isNative &&
        typeof window !== 'undefined' &&
        typeof window.Notification !== 'undefined' &&
        window.Notification.permission === 'granted'
      ) {
        try {
          new window.Notification(payload.notification?.title || 'AgriMarché', {
            body: payload.notification?.body,
            icon: '/logo.png',
          });
        } catch (err) {
          console.warn('Notification native non disponible:', err);
        }
      }
    });

    return unsubscribe;
  }, [onMessageReceived, isNative]);

  // ── FIX : persistance Firestore ──────────────────────────────
  // Avant : ces deux fonctions ne faisaient que setNotifications(...) en local.
  // Résultat : une notif "lue" redevenait non-lue au prochain onSnapshot/reload,
  // puisque le document Firestore gardait read: false.
  // Maintenant : on met à jour l'état local tout de suite (optimiste, UI réactive),
  // ET on persiste dans Firestore. Le onSnapshot recevra ensuite la même valeur
  // en confirmation, donc pas de double-render visible.
  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

    updateDoc(doc(db, 'notifications', id), { read: true }).catch((err) => {
      console.error('markAsRead Firestore:', err);
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const unread = prev.filter((n) => !n.read);

      if (unread.length > 0) {
        const batch = writeBatch(db);
        unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
        batch.commit().catch((err) => {
          console.error('markAllAsRead Firestore:', err);
        });
      }

      return prev.map((n) => ({ ...n, read: true }));
    });
  }, []);

  const showNotification = useCallback(
    (notif: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
      const newNotification: Notification = {
        ...notif,
        id: Date.now().toString(),
        read: false,
        createdAt: new Date(),
      };
      setNotifications((prev) => [newNotification, ...prev]);
    },
    []
  );

  const requestPermission = useCallback(async () => {
    try {
      await requestFCMToken();
    } catch (err) {
      console.warn('Erreur demande permission notifications:', err);
    } finally {
      markDismissed();
      setShowNotifButton(false);
    }
  }, [requestFCMToken]);

  const dismissNotifButton = useCallback(() => {
    markDismissed();
    setShowNotifButton(false);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const formatTime = (date: Date) => {
    const diff = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (diff < 60) return "À l'instant";
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    return `il y a ${Math.floor(diff / 86400)} j`;
  };

  // ── FIX : le Provider est maintenant TOUJOURS monté ──────────
  // Avant : `if (!isMounted) return <>{children}</>;` rendait les enfants
  // SANS le Provider au tout premier render. Si un enfant appelait
  // useNotifications() dès son propre premier render, ça jetait
  // immédiatement "useNotifications must be used within NotificationProvider".
  // Maintenant : on enveloppe toujours children dans le Provider, et seul
  // l'affichage du bouton flottant custom reste conditionné par isMounted
  // (pour éviter un mismatch d'hydratation SSR/client sur CE bouton précis).
  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        showNotification,
        requestPermission,
        permission,
      }}
    >
      {/* Bouton flottant custom — UNIQUEMENT sur web, jamais sur APK natif
          (côté natif, la popup système se déclenche automatiquement, voir useEffect ci-dessus) */}
      {isMounted && user && !isNative && permission === 'default' && showNotifButton && (
        <div className="fixed bottom-24 left-4 z-50 flex items-center gap-1">
          <button
            onClick={requestPermission}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-bounce"
          >
            <Bell size={16} />
            Activer les notifications
          </button>
          <button
            onClick={dismissNotifButton}
            className="bg-white/90 text-gray-600 rounded-full p-1.5 shadow"
            aria-label="Fermer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {children}
    </NotificationContext.Provider>
  );
}
