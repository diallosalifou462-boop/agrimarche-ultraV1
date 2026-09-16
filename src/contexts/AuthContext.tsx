'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  EmailAuthProvider,
  linkWithCredential,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, increment } from 'firebase/firestore';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db, waitForFirestoreReady, trace } from '@/lib/firebase/firebase';
import { ensureUserExists } from '@/lib/firebase/userProfile';
import { trackActivityTick } from '@/lib/interests/trackActivity';

// =====================================================
// ⚡ FUSION useAuth.ts + AuthContext.tsx
// =====================================================
// Avant : `hooks/useAuth.ts` était un hook classique, réabonné à
// `onAuthStateChanged` à CHAQUE composant qui l'appelait (27 fichiers dans
// ce projet). En parallèle, `AuthContext.tsx` faisait exactement la même
// chose une deuxième fois. Résultat : jusqu'à 27+1 listeners Auth actifs
// simultanément, autant de lectures Firestore concurrentes pour le même
// utilisateur, et une charge qui aggravait le déclenchement des filets de
// sécurité de 8s.
//
// Maintenant : TOUTE la logique vit ici, dans le Provider, monté UNE SEULE
// FOIS (dans le layout racine). `hooks/useAuth.ts` n'est plus qu'un simple
// re-export de ce contexte, pour ne pas avoir à modifier les 27 fichiers
// qui l'importent déjà.
// =====================================================

// ─── Helper : numéro → email synthétique ─────────────────
export function phoneToEmail(phone: string): string {
  return `${phone.replace(/\D/g, '')}@agrimarche.sn`;
}

// ─── Rafraîchir le token FCM (SANS jamais demander la permission) ─────────
//
// ⚠️ FIX CRITIQUE : cette fonction appelait auparavant
// `Notification.requestPermission()` elle-même, à CHAQUE connexion, via
// `onAuthStateChanged` — donc hors de tout geste utilisateur (clic).
// Deux conséquences graves et silencieuses :
//   1. La plupart des navigateurs bloquent ou ignorent un prompt de
//      permission qui n'est pas déclenché par un clic. Et si l'utilisateur
//      le refuse quand même, `Notification.permission` devient 'denied' de
//      façon PERMANENTE pour cette origine — impossible de redemander en JS
//      ensuite, y compris via le vrai bouton "Activer les notifications"
//      (NotificationProvider.tsx / useFCMToken.ts), qui est censé être la
//      SEULE source de vérité pour cette demande.
//   2. Même quand ça fonctionnait, le token obtenu était écrit dans
//      users/{uid}.fcmToken — un champ que PLUS AUCUNE route d'envoi ne lit
//      (voir les commentaires dans /api/notifications/send,
//      /api/send-push, /api/orders/notify-seller : elles lisent toutes la
//      sous-collection users/{uid}/tokens/{token}, écrite par
//      useFCMToken.ts). Un utilisateur pouvait donc "accepter" les
//      notifications via ce chemin et n'en recevoir strictement aucune.
//
// Maintenant : on ne fait plus que RAFRAÎCHIR le token si la permission est
// déjà accordée (utile après un changement d'appareil ou une expiration de
// token), et on écrit au bon endroit — la même sous-collection que
// useFCMToken.ts, pour rester lisible par toutes les routes d'envoi.
async function registerNotificationToken(uid: string) {
  try {
    const supported = await isSupported();
    if (!supported) return;
    if (typeof window === 'undefined' || Notification.permission !== 'granted') return;

    // Sécurité : sous Capacitor iOS, `navigator.serviceWorker.ready` ne se
    // résout jamais (pas de SW actif sous le scheme capacitor://). On plafonne
    // donc l'attente pour ne pas laisser une promesse pendre indéfiniment,
    // même en arrière-plan.
    const swRegistration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('serviceWorker.ready timeout')), 5000),
      ),
    ]);

    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (token) {
      if (!auth.currentUser || auth.currentUser.uid !== uid) {
        console.warn(
          '[FCM] Abandon écriture token : auth.currentUser ne correspond plus à uid',
          { uid, currentUser: auth.currentUser?.uid ?? null },
        );
        return;
      }

      await setDoc(
        doc(db, 'users', uid, 'tokens', token),
        {
          token,
          createdAt: new Date(),
          platform: 'web',
          ...(typeof navigator !== 'undefined' ? { userAgent: navigator.userAgent } : {}),
        },
        { merge: true },
      );
      console.log('[FCM] Token rafraîchi ✅');
    }
  } catch (error) {
    console.error('[FCM] Erreur rafraîchissement token:', error);
  }
}

// ─── Suivi "dernière activité" + "fréquence de retour" (onglet Admin) ─────
//
// Complète trackActivityTick (qui alimente activityHistogram, pour les
// heures de silence des notifs) sans le remplacer : ici on écrit
// users/{uid}.lastActiveAt (horodatage serveur, à chaque session),
// users/{uid}.sessionCount (compteur total de visites) et
// users/{uid}.recentVisits (les N dernières dates de visite en ms epoch,
// la plus récente en premier), qui permet de calculer côté admin l'écart
// moyen entre deux visites et de repérer un utilisateur en train de
// décrocher (retard anormal par rapport à son propre rythme).
//
// Choix volontaire : PAS de durée de session. Sans fermeture propre d'app
// mobile (Capacitor peut être tué par l'OS sans signal), toute mesure de
// durée serait soit fausse soit exigerait un heartbeat régulier — un coût
// d'écriture Firestore récurrent pour un signal peu actionnable sur une
// marketplace. La fréquence de retour, elle, est fiable et actionnable
// (relance ciblée avant qu'un vendeur/client ne devienne inactif).
const LOGIN_TICK_THROTTLE_MS = 12 * 60 * 60 * 1000; // 12h — une "visite" par demi-journée max/appareil
const MAX_RECENT_VISITS = 20; // borne volontaire : assez pour une moyenne fiable, coût de stockage négligeable

function loginTickStorageKey(uid: string): string {
  return `agrimarche_login_tick_${uid}`;
}

async function trackLoginActivity(uid: string | undefined | null): Promise<void> {
  if (!uid || typeof window === 'undefined') return;
  try {
    const key = loginTickStorageKey(uid);
    const lastTickMs = Number(window.localStorage.getItem(key) ?? 0);
    const nowMs = Date.now();
    const isNewSession = nowMs - lastTickMs >= LOGIN_TICK_THROTTLE_MS;
    const userRef = doc(db, 'users', uid);

    const updateData: Record<string, unknown> = { lastActiveAt: serverTimestamp() };

    if (isNewSession) {
      // Lecture nécessaire uniquement ici (throttlée à 1x/12h/appareil) pour
      // pouvoir tronquer nous-mêmes le tableau — arrayUnion ne borne pas la
      // taille, et un histogramme illimité finirait par coûter cher en
      // lecture/bande passante sur les comptes très actifs.
      const snap = await getDoc(userRef).catch(() => null);
      const existingRaw = snap?.data()?.recentVisits;
      const existing: number[] = Array.isArray(existingRaw) ? existingRaw : [];
      updateData.recentVisits = [nowMs, ...existing].slice(0, MAX_RECENT_VISITS);
      updateData.sessionCount = increment(1);
    }

    await setDoc(userRef, updateData, { merge: true });
    if (isNewSession) window.localStorage.setItem(key, String(nowMs));
  } catch (err) {
    // Best-effort — même philosophie que trackActivityTick : ne jamais
    // gêner l'utilisateur pour un point d'activité manqué.
    console.warn('[trackLoginActivity] échec silencieux:', err);
  }

}

// ─── Migration du token FCM pré-inscription (deviceTokens/{token}) ────────
//
// useFCMToken.ts peut désormais obtenir un token FCM AVANT la connexion
// (token lié à l'appareil, pas au compte) et le pose dans deviceTokens/
// {token} + une trace en localStorage. Dès qu'un utilisateur se connecte
// (ou s'inscrit) sur CET appareil, on rattache ce token à son compte dans
// users/{uid}/tokens/{token} — l'endroit que lisent toutes les routes
// d'envoi de notifs — puis on nettoie le doc anonyme.
const PENDING_FCM_TOKEN_KEY = 'agrimarche_pending_fcm_token';

async function migratePendingFcmToken(uid: string | undefined | null): Promise<void> {
  if (!uid || typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(PENDING_FCM_TOKEN_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as { token?: string; platform?: string };
    const pendingToken = parsed?.token;
    if (!pendingToken) {
      window.localStorage.removeItem(PENDING_FCM_TOKEN_KEY);
      return;
    }

    const anonRef = doc(db, 'deviceTokens', pendingToken);
    const snap = await getDoc(anonRef).catch(() => null);

    if (snap?.exists()) {
      const data = snap.data() as { platform?: string; createdAt?: unknown; userAgent?: string };
      await setDoc(
        doc(db, 'users', uid, 'tokens', pendingToken),
        {
          token: pendingToken,
          platform: data.platform ?? parsed.platform ?? 'web',
          createdAt: data.createdAt ?? new Date(),
          ...(data.userAgent ? { userAgent: data.userAgent } : {}),
        },
        { merge: true },
      );
      // Best-effort : autorisé par la règle deviceTokens (allow delete: if
      // isAuth()) — un échec ici ne doit pas empêcher la migration d'avoir
      // eu lieu, le doc orphelin sera simplement ignoré ensuite.
      await deleteDoc(anonRef).catch(() => {});
    }

    window.localStorage.removeItem(PENDING_FCM_TOKEN_KEY);
  } catch (err) {
    console.warn('[migratePendingFcmToken] échec silencieux:', err);
  }
}

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  authDebugInfo: string;
  signIn: (emailOrPhone: string, password: string) => Promise<any>;
  signUp: (
    emailOrPhone: string,
    password: string,
    name: string,
    extra?: Record<string, any>,
  ) => Promise<any>;
  logout: () => Promise<void>;
  updateUserProfile: (data: { displayName?: string; phone?: string }) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  phoneToEmail: (phone: string) => string;
  suppressAutoProfileRef: React.MutableRefObject<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [authDebugInfo, setAuthDebugInfo] = useState('');

  // ─── Anti-collision inscription ────────────────────────
  // Pendant une inscription, onAuthStateChanged se déclenche dès la
  // connexion par téléphone (avant que signUp() ait écrit le profil
  // complet). On suspend la création automatique tant qu'une inscription
  // est en cours (voir signUp plus bas).
  const suppressAutoProfileRef = useRef(false);

  // ─── Chargement profil Firestore ──────────────────────
  const fetchUserProfile = async (uid: string, email: string | null) => {
    trace('AUTH', `fetchUserProfile(${uid}) — début`);
    try {
      if (suppressAutoProfileRef.current) {
        trace('AUTH', 'fetchUserProfile — branche signUp en cours, attente Firestore');
        await waitForFirestoreReady();
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        setProfile(userSnap.exists() ? userSnap.data() : null);
        trace('PROFIL', 'profil chargé (branche signUp)');
        return;
      }

      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== uid) {
        trace('AUTH', 'fetchUserProfile abandonné — currentUser ne correspond plus à uid');
        return;
      }

      const profile = await ensureUserExists(currentUser);
      setProfile(profile);
      trace('PROFIL', `profil chargé, role=${profile?.role}`);
    } catch (error) {
      console.error('Erreur chargement profil:', error);
      trace('PROFIL', 'ÉCHEC chargement profil', (error as Error)?.message || error);
    }
  };

  useEffect(() => {
    trace('AUTH', 'AuthProvider monté — abonnement à onAuthStateChanged (source unique)');

    // 🔎 Sur natif, le plugin @capacitor-firebase/authentication ne
    // synchronise la session vers le SDK JS (`onAuthStateChanged`) qu'en
    // réaction à un appel explicite. On force cette synchro dès le montage.
    if (Capacitor.isNativePlatform()) {
      trace('AUTH', 'natif détecté — appel FirebaseAuthentication.getCurrentUser() pour forcer la resynchro');
      FirebaseAuthentication.getCurrentUser().catch((err) => {
        console.error('[AuthContext] Échec resynchro native → JS SDK:', err);
      });
    }

    let settled = false;

    // ⚠️ Filet de sécurité : si onAuthStateChanged ne se déclenche jamais,
    // on débloque quand même `loading` pour ne pas geler toute l'app.
    const failsafe = setTimeout(() => {
      if (settled) return;
      console.error('[AuthContext] onAuthStateChanged ne s\'est jamais déclenché après 8s — déblocage forcé');
      setAuthDebugInfo('timeout 8s — onAuthStateChanged ne s\'est jamais déclenché (SDK Auth bloqué)');
      setLoading(false);
    }, 8000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      settled = true;
      clearTimeout(failsafe);
      setAuthDebugInfo('');
      trace('AUTH', `onAuthStateChanged déclenché, user=${firebaseUser?.uid ?? 'null'}`);
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          await Promise.race([
            fetchUserProfile(firebaseUser.uid, firebaseUser.email),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('[AuthContext] Timeout global (9s) sur fetchUserProfile')), 9000),
            ),
          ]);
        } catch (error) {
          console.error('[AuthContext] fetchUserProfile abandonné (filet de sécurité):', error);
          setAuthDebugInfo(`profil non chargé : ${(error as Error)?.message || error}`);
        }
        registerNotificationToken(firebaseUser.uid); // fire-and-forget, ne bloque pas le chargement
        trackActivityTick(firebaseUser.uid); // fire-and-forget, throttlé en interne (voir trackActivity.ts)
        trackLoginActivity(firebaseUser.uid); // fire-and-forget, throttlé en interne (lastActiveAt + sessionCount)
        migratePendingFcmToken(firebaseUser.uid); // fire-and-forget, no-op si aucun token en attente
      } else {
        setProfile(null);
      }

      trace('AUTH', 'loading=false — AuthContext considéré comme prêt');
      setLoading(false);
    }, (authErr) => {
      settled = true;
      clearTimeout(failsafe);
      console.error('[AuthContext] Erreur onAuthStateChanged (listener):', authErr);
      setAuthDebugInfo(`erreur listener auth : ${(authErr as Error)?.message || authErr}`);
      setLoading(false);
    });

    // Sur natif, un retour d'arrière-plan ne redéclenche pas la synchro :
    // on la relance nous-mêmes à chaque reprise d'activité de l'app.
    let removeResumeListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            FirebaseAuthentication.getCurrentUser().catch((err) => {
              console.error('[AuthContext] Échec resynchro (reprise app):', err);
            });
            // Reprise d'activité côté natif : onAuthStateChanged ne se
            // redéclenche pas ici (la session ne change pas), donc c'est
            // le seul point où capter qu'un utilisateur déjà connecté
            // vient d'ouvrir l'app à CETTE heure-ci.
            trackActivityTick(auth.currentUser?.uid);
            trackLoginActivity(auth.currentUser?.uid);
          }
        }).then((handle) => {
          removeResumeListener = () => handle.remove();
        });
      }).catch(() => {
        // @capacitor/app indisponible — pas de resynchro au retour d'arrière-plan
      });
    }

    return () => {
      clearTimeout(failsafe);
      unsubscribe();
      removeResumeListener?.();
    };
  }, []);

  // ─── Écouter les notifications en avant-plan ─────────
  useEffect(() => {
    if (!user) return;
    let unsubscribe: (() => void) | null = null;

    isSupported().then((supported) => {
      if (!supported) return;
      const messaging = getMessaging();
      unsubscribe = onMessage(messaging, (payload) => {
        console.log('[FCM] Notification reçue en avant-plan:', payload);
        if (Notification.permission === 'granted') {
          const { title, body, icon } = payload.notification || {};
          new Notification(title || 'AgriMarché', {
            body: body || '',
            icon: icon || '/logo.png',
            badge: '/logo.png',
          });
        }
      });
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, [user]);

  // ─── Connexion ────────────────────────────────────────
  const signIn = async (emailOrPhone: string, password: string) => {
    const email = emailOrPhone.includes('@') ? emailOrPhone : phoneToEmail(emailOrPhone);
    const result = await signInWithEmailAndPassword(auth, email, password);
    await fetchUserProfile(result.user.uid, result.user.email);
    trackLoginActivity(result.user.uid); // fire-and-forget
    migratePendingFcmToken(result.user.uid); // fire-and-forget
    return result;
  };

  // ─── Inscription ──────────────────────────────────────
  const signUp = async (
    emailOrPhone: string,
    password: string,
    name: string,
    extra?: Record<string, any>,
  ) => {
    suppressAutoProfileRef.current = true;
    try {
      const email = emailOrPhone.includes('@') ? emailOrPhone : phoneToEmail(emailOrPhone);
      const currentUser = auth.currentUser;
      let firebaseUser: User;

      if (currentUser) {
        const credential = EmailAuthProvider.credential(email, password);
        const linkedResult = await linkWithCredential(currentUser, credential);
        firebaseUser = linkedResult.user;
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
      }

      await updateProfile(firebaseUser, { displayName: name });

      const userProfile = {
        uid: firebaseUser.uid,
        email,
        displayName: name,
        phone: extra?.phone ?? '',
        phoneVerified: extra?.phoneVerified ?? false,
        role: extra?.role ?? 'client',
        region: extra?.region ?? '',
        departement: extra?.departement ?? '',
        commune: extra?.commune ?? '',
        quartier: extra?.quartier ?? '',
        createdAt: new Date().toISOString(),
      };

      try {
        await setDoc(doc(db, 'users', firebaseUser.uid), userProfile);
      } catch (err) {
        console.error('[signUp] Échec écriture Firestore users/', firebaseUser.uid, err);
        throw err;
      }

      setProfile(userProfile);
      migratePendingFcmToken(firebaseUser.uid); // fire-and-forget — le cas d'usage visé : token capté avant l'inscription
      return { user: firebaseUser };
    } finally {
      suppressAutoProfileRef.current = false;
    }
  };

  // ─── Déconnexion ──────────────────────────────────────
  const logout = async () => {
    await signOut(auth);
    setProfile(null);
    setUser(null);
  };

  // ─── Mise à jour profil ───────────────────────────────
  const updateUserProfile = async (data: { displayName?: string; phone?: string }) => {
    if (!user) throw new Error('Aucun utilisateur connecté');
    if (data.displayName) await updateProfile(user, { displayName: data.displayName });
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, data);
    setProfile((prev: any) => ({ ...prev, ...data }));
  };

  // ─── Reset mot de passe ────────────────────────────────
  const resetPassword = async (email: string) => {
    return sendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        authDebugInfo,
        signIn,
        signUp,
        logout,
        updateUserProfile,
        resetPassword,
        phoneToEmail,
        suppressAutoProfileRef,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
