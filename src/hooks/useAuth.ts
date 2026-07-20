'use client';

import { useEffect, useRef, useState } from 'react';
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
import { auth, db } from '@/lib/firebase/firebase';
import { ensureUserExists } from '@/lib/firebase/userProfile';

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

export function useAuth() {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // ⚡ FIX (parité avec Produits) : détail brut affichable à l'écran si le
  // chargement a dû être débloqué par un filet de sécurité — pour pouvoir
  // diagnostiquer Panier/Compte de la même façon que Produits, sans outil
  // externe.
  const [authDebugInfo, setAuthDebugInfo] = useState('');

  // ─── Anti-collision inscription ────────────────────────
  // Pendant une inscription, onAuthStateChanged se déclenche dès la
  // connexion par téléphone (avant que signUp() ait écrit le profil
  // complet). Si fetchUserProfile crée un doc "placeholder" à ce
  // moment-là (email: null, createdAt: T1), l'écriture complète de
  // signUp() juste après est alors traitée comme un UPDATE (pas un
  // CREATE) par les règles Firestore — et échoue car les règles
  // interdisent de changer email/createdAt sur update. On suspend
  // donc la création automatique tant qu'une inscription est en cours.
  const suppressAutoProfileRef = useRef(false);

  // ─── Chargement profil Firestore ──────────────────────
  // Étape unique après toute connexion (OTP téléphone, WhatsApp OTP via
  // custom token, email/password...) : garantir que users/{uid} existe,
  // et le créer avec des valeurs par défaut sinon. Voir ensureUserExists
  // dans lib/firebase/userProfile.ts pour le détail et le pourquoi.
  const fetchUserProfile = async (uid: string, email: string | null) => {
    try {
      if (suppressAutoProfileRef.current) {
        // Inscription en cours : signUp() va créer le doc complet
        // juste après, on ne crée rien ici pour éviter le conflit
        // (voir le commentaire sur suppressAutoProfileRef plus haut).
        const userRef  = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        setProfile(userSnap.exists() ? userSnap.data() : null);
        return;
      }

      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== uid) {
        // Session déjà changée entre-temps : on abandonne proprement
        // plutôt que d'écrire un profil pour le mauvais utilisateur.
        return;
      }

      const profile = await ensureUserExists(currentUser);
      setProfile(profile);
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    }
  };

  // ─── Mise à jour profil ───────────────────────────────
  const updateUserProfile = async (data: { displayName?: string; phone?: string }) => {
    if (!user) throw new Error('Aucun utilisateur connecté');
    if (data.displayName) await updateProfile(user, { displayName: data.displayName });
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, data);
    setProfile((prev: any) => ({ ...prev, ...data }));
  };

  // ─── Reset mot de passe (legacy) ─────────────────────
  const resetPassword = async (email: string) => {
    return sendPasswordResetEmail(auth, email);
  };

  // ─── Observer Firebase Auth ───────────────────────────
  // ⚠️ FIX : `registerNotificationToken` fait `await navigator.serviceWorker.ready`
  // pour obtenir le token FCM. Sous Capacitor iOS (scheme capacitor://localhost),
  // aucun Service Worker actif n'existe jamais, donc cette promesse ne se résout
  // JAMAIS. Comme cet appel était `await`-é avant `setLoading(false)`, le
  // chargement restait bloqué à `true` pour toujours dès qu'un utilisateur était
  // connecté — d'où le skeleton infini sur Produits/Panier/Compte (ces pages
  // n'attachent même pas leurs listeners Firestore tant que `loading` est vrai).
  // On ne bloque donc plus le chargement critique sur l'enregistrement FCM :
  // il part en arrière-plan (fire-and-forget), avec son propre try/catch interne.
  //
  // ⚠️ FIX (filet de sécurité ultime) : `fetchUserProfile` appelle
  // `ensureUserExists`, qui a déjà ses propres timeouts internes de 8s sur
  // chaque appel Firestore (voir userProfile.ts). Mais `useAuth()` est LE
  // hook dont dépend absolument toute l'app (Produits, Panier, Compte...) —
  // on ne peut pas se permettre qu'un futur changement dans cette chaîne
  // d'appels réintroduise un `await` non borné sans qu'on s'en aperçoive.
  // On plafonne donc ICI, au niveau le plus haut, la durée totale de
  // résolution du chargement à 9s : passé ce délai, on abandonne le profil
  // (l'utilisateur reste connecté, juste sans `profile` chargé pour l'instant
  // — les pages qui en ont besoin le rechargeront) et on débloque
  // `setLoading(false)` dans tous les cas.
  useEffect(() => {
    let settled = false;

    // 🔎 CAUSE RÉELLE (confirmée) : sur natif, @capacitor-firebase/authentication
    // ne synchronise la session vers le SDK JS (donc onAuthStateChanged) qu'en
    // réaction à un appel explicite. Au lancement à froid / retour d'arrière-plan,
    // rien ne redéclenche cette synchro — d'où le watchdog 8s systématique sur
    // mobile. On force la resynchro ici, et à chaque reprise d'activité.
    if (Capacitor.isNativePlatform()) {
      FirebaseAuthentication.getCurrentUser().catch((err) => {
        console.error('[useAuth] Échec resynchro native → JS SDK:', err);
      });
    }
    let removeResumeListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            FirebaseAuthentication.getCurrentUser().catch((err) => {
              console.error('[useAuth] Échec resynchro (reprise app):', err);
            });
          }
        }).then((handle) => {
          removeResumeListener = () => handle.remove();
        });
      }).catch(() => {
        // @capacitor/app indisponible — pas de resynchro au retour d'arrière-plan
      });
    }

    // ⚡ FIX (parité Produits/Panier/Compte) : jusqu'ici, TOUT le filet de
    // sécurité (le Promise.race de 9s ci-dessous) était À L'INTÉRIEUR du
    // callback d'onAuthStateChanged. Si le SDK Firebase Auth lui-même
    // n'appelait JAMAIS ce callback (panne réseau au niveau du SDK Auth,
    // même classe de problème que celle déjà rencontrée sur le transport
    // Firestore), rien ne débloquait `loading` — Panier et Compte, qui en
    // dépendent tous les deux pour leur rendu principal, restaient bloqués
    // indéfiniment, MÊME APRÈS que Produits (qui ne dépend plus de
    // `loading` pour ses données) ait pu s'afficher normalement. On ajoute
    // donc un filet de sécurité encore plus extérieur, complètement
    // indépendant du callback lui-même.
    const outerWatchdog = setTimeout(() => {
      if (settled) return;
      console.warn('[useAuth] onAuthStateChanged ne s\'est jamais déclenché après 8s — déblocage forcé');
      setAuthDebugInfo('timeout 8s — onAuthStateChanged ne s\'est jamais déclenché (SDK Auth bloqué)');
      setLoading(false);
    }, 8000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      settled = true;
      clearTimeout(outerWatchdog);
      setAuthDebugInfo('');
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          await Promise.race([
            fetchUserProfile(firebaseUser.uid, firebaseUser.email),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('[useAuth] Timeout global (9s) sur fetchUserProfile')), 9000),
            ),
          ]);
        } catch (error) {
          console.error('[useAuth] fetchUserProfile abandonné (filet de sécurité):', error);
          setAuthDebugInfo(`profil non chargé : ${(error as Error)?.message || error}`);
        }
        registerNotificationToken(firebaseUser.uid); // pas de await : ne bloque plus le chargement
      } else {
        setProfile(null);
      }
      setLoading(false);
    }, (authErr) => {
      // Erreur du listener onAuthStateChanged lui-même (rare, mais possible).
      settled = true;
      clearTimeout(outerWatchdog);
      console.error('[useAuth] Erreur onAuthStateChanged (listener):', authErr);
      setAuthDebugInfo(`erreur listener auth : ${(authErr as Error)?.message || authErr}`);
      setLoading(false);
    });
    return () => {
      clearTimeout(outerWatchdog);
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
    const email = emailOrPhone.includes('@')
      ? emailOrPhone
      : phoneToEmail(emailOrPhone);
    const result = await signInWithEmailAndPassword(auth, email, password);
    await fetchUserProfile(result.user.uid, result.user.email);
    return result;
  };

  // ─── Inscription ──────────────────────────────────────
  // IMPORTANT : à ce stade, l'utilisateur est déjà connecté via
  // le flow OTP téléphone (auth.currentUser existe, provider "phone").
  // On NE VEUT PAS créer un second compte Firebase (createUserWithEmailAndPassword
  // le ferait et changerait l'UID courant, abandonnant le compte téléphone
  // déjà vérifié — c'est ce qui empêchait l'écriture Firestore d'aboutir
  // sur le bon UID / cassait les règles de sécurité basées sur la vérif SMS).
  // On LIE plutôt un identifiant email/password au compte téléphone existant,
  // afin de garder le même UID du début à la fin.
  const signUp = async (
    emailOrPhone: string,
    password: string,
    name: string,
    extra?: Record<string, any>,
  ) => {
    // Suspend la création auto de profil (fetchUserProfile) tant que
    // cette fonction tourne : évite le conflit de règles Firestore
    // décrit plus haut (voir commentaire sur suppressAutoProfileRef).
    suppressAutoProfileRef.current = true;
    try {
      const email = emailOrPhone.includes('@')
        ? emailOrPhone
        : phoneToEmail(emailOrPhone);

      const currentUser = auth.currentUser;
      let firebaseUser: User;

      if (currentUser) {
        // Cas normal : déjà connecté via OTP téléphone → on lie l'email/password
        const credential = EmailAuthProvider.credential(email, password);
        const linkedResult = await linkWithCredential(currentUser, credential);
        firebaseUser = linkedResult.user;
      } else {
        // Filet de sécurité si jamais aucun utilisateur n'est connecté
        // (ne devrait pas arriver dans le flow normal d'inscription)
        const result = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
      }

      await updateProfile(firebaseUser, { displayName: name });

      const userProfile = {
        uid:           firebaseUser.uid,
        email,
        displayName:   name,
        phone:         extra?.phone        ?? '',
        phoneVerified: extra?.phoneVerified ?? false,
        role:          extra?.role         ?? 'client',
        region:        extra?.region       ?? '',
        departement:   extra?.departement  ?? '',
        commune:       extra?.commune      ?? '',
        quartier:      extra?.quartier     ?? '',
        createdAt:     new Date().toISOString(),
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

  return {
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
  };
}
