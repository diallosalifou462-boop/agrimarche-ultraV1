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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db, waitForFirestoreReady } from '@/lib/firebase/firebase';
import { ensureUserExists } from '@/lib/firebase/userProfile';

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

// ─── Demander permission + enregistrer token FCM ─────────
async function registerNotificationToken(uid: string) {
  try {
    const supported = await isSupported();
    if (!supported) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Permission refusée');
      return;
    }

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
        doc(db, 'users', uid),
        {
          fcmToken: token,
          fcmTokenUpdatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      console.log('[FCM] Token enregistré ✅');
    }
  } catch (error) {
    console.error('[FCM] Erreur enregistrement token:', error);
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
    try {
      if (suppressAutoProfileRef.current) {
        await waitForFirestoreReady();
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        setProfile(userSnap.exists() ? userSnap.data() : null);
        return;
      }

      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== uid) {
        return;
      }

      const profile = await ensureUserExists(currentUser);
      setProfile(profile);
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    }
  };

  useEffect(() => {
    console.log('[AuthContext] Abonnement à onAuthStateChanged (source unique)...');

    // 🔎 Sur natif, le plugin @capacitor-firebase/authentication ne
    // synchronise la session vers le SDK JS (`onAuthStateChanged`) qu'en
    // réaction à un appel explicite. On force cette synchro dès le montage.
    if (Capacitor.isNativePlatform()) {
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
      console.log('[AuthContext] onAuthStateChanged déclenché, user =', firebaseUser?.uid ?? 'null');
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
      } else {
        setProfile(null);
      }

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
