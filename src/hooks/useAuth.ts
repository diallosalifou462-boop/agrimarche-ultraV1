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

    const swRegistration = await navigator.serviceWorker.ready;

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
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchUserProfile(firebaseUser.uid, firebaseUser.email);
        await registerNotificationToken(firebaseUser.uid);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
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
    signIn,
    signUp,
    logout,
    updateUserProfile,
    resetPassword,
    phoneToEmail,
    suppressAutoProfileRef,
  };
}
