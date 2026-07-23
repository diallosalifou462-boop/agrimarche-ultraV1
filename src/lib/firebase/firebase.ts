import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { initializeFirestore, onSnapshotsInSync, collection, query, limit, getDocs, doc, getDoc, setDoc, updateDoc, onSnapshot, Timestamp, arrayUnion, arrayRemove, increment, writeBatch } from 'firebase/firestore';
import { getStorage, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { getAnalytics, isSupported as analyticsIsSupported } from 'firebase/analytics';
import { Capacitor } from '@capacitor/core';

// =====================================================
// CONFIG FIREBASE
// =====================================================

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyD9HHxhbNvOQizx7Qbp4JVSThFW1OyTO_A',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'agrimarche-24e37.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'agrimarche-24e37',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'agrimarche-24e37.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '21462709831',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:21462709831:web:e82e3b09279ac7584ba362',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-0L41S1RHWZ',
};

// =====================================================
// INITIALISATION
// =====================================================

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// ⚠️ FIX : `getFirestore(app)` utilise par défaut une connexion en streaming
// (WebChannel/HTTP2) pour les listeners `onSnapshot`. Sous Capacitor iOS
// (WKWebView, scheme capacitor://localhost), si cette connexion tente de
// s'établir avant que la pile réseau native soit pleinement initialisée —
// ce qui arrive typiquement au tout premier lancement à froid quand la
// connexion (wifi/4G) est déjà active — elle reste bloquée dans une boucle
// de reconnexion silencieuse : aucune donnée n'arrive jamais, aucune erreur
// n'est levée non plus. C'est pour ça que couper puis rallumer la connexion
// "débloquait" l'app : ça forçait le navigateur à renégocier une connexion
// propre.
//
// ⚠️ FIX (v2) : `experimentalAutoDetectLongPolling` fait d'abord une phase
// de DÉTECTION pour choisir entre streaming et long-polling — et cette
// détection elle-même peut rester bloquée sans jamais aboutir sur un réseau
// mobile instable (signal faible, coupures), ce qui reproduit exactement le
// même symptôme qu'on essayait de corriger. `experimentalForceLongPolling`
// saute complètement cette phase de détection et utilise directement le
// long-polling (simples requêtes HTTP, le protocole le plus robuste et le
// plus largement supporté), au prix d'un tout petit surcoût réseau —
// largement compensé par la fiabilité sur les connexions faibles typiques
// du terrain (Sénégal, zones rurales).
//
// ⚠️ FIX v6 — ce forçage ne doit s'appliquer QUE sur natif (Capacitor
// iOS/Android), pas dans un navigateur classique (Chrome/Edge en dev sur
// localhost, ou PWA web). Un vrai navigateur gère très bien le streaming
// WebChannel natif — c'est justement ce que ce fix contourne. En le
// forçant aussi côté web, chaque connexion Firestore devient un
// "hanging GET" qui met 15 à 30s à s'établir (visible dans l'onglet
// Réseau : requêtes `channel?gsessionid=...` très longues), ce qui
// dépasse largement les filets de sécurité de 5-8s ailleurs dans le code
// et déclenche des `[firebase] Firestore prêt (timeout de sécurité 5s)`
// à répétition alors que rien n'est réellement cassé. Sur le web, le SDK
// choisit lui-même le meilleur transport (généralement le streaming,
// beaucoup plus rapide à établir).
const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

export const db = initializeFirestore(app, {
  ...(isNative ? { experimentalForceLongPolling: true } : {}),
});

// ⚠️ FIX v5 — CAUSE RÉELLE CONFIRMÉE (erreur exacte capturée en prod) :
// `FirebaseError: Failed to get document because the client is offline`.
//
// Le vrai problème n'était ni le réseau, ni IndexedDB, ni le long-polling :
// c'est que `ensureUserExists()` appelle `getDoc()` — une lecture UNIQUE,
// pas un listener — immédiatement après la connexion de l'utilisateur.
// Or `getDoc()` (contrairement à `onSnapshot()`) échoue IMMÉDIATEMENT avec
// "client is offline" si le SDK Firestore n'a pas encore intérieurement
// confirmé son état "en ligne", même si le réseau de l'appareil fonctionne
// très bien — c'est un pur problème de timing interne au SDK au démarrage
// à froid, pas un problème réseau réel. Une fois cette première lecture
// ratée, l'état de l'app (profil non chargé, redirection non faite) restait
// cassé, même si Firestore se connectait correctement juste après.
//
// La solution : exposer un vrai signal "Firestore est prêt" basé sur
// `onSnapshotsInSync` (l'événement officiel de synchronisation avec le
// serveur), que `ensureUserExists()` et toute autre lecture ponctuelle
// attendent AVANT de faire leur premier `getDoc()`. Un timeout de sécurité
// de 5s évite de bloquer indéfiniment si cet événement ne se déclenchait
// jamais pour une raison quelconque.
let firestoreReadyPromise: Promise<void> | null = null;

export function waitForFirestoreReady(timeoutMs = 5000): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  if (!firestoreReadyPromise) {
    firestoreReadyPromise = new Promise<void>((resolve) => {
      let done = false;
      const finish = (reason: string) => {
        if (done) return;
        done = true;
        console.log(`[firebase] Firestore prêt (${reason})`);
        resolve();
      };

      const timer = setTimeout(() => finish('timeout de sécurité 5s'), timeoutMs);

      const unsubscribe = onSnapshotsInSync(db, () => {
        clearTimeout(timer);
        unsubscribe();
        finish('onSnapshotsInSync');
      });
    });
  }

  return firestoreReadyPromise;
}

// ⚠️ FIX v3 — CAUSE CONFIRMÉE DU BLOCAGE TOTAL : `enableIndexedDbPersistence`
// n'est pas un simple cache à côté, c'est un VERROU interne que le SDK
// Firestore utilise pour synchroniser TOUTES ses opérations (lectures,
// écritures, listeners) via IndexedDB. Preuve définitive : une requête HTTP
// brute vers l'API REST Firestore répondait 200 normalement (elle
// contourne entièrement le SDK JS), alors que TOUT ce qui passait par ce
// SDK (onSnapshot, y compris sur des collections totalement différentes)
// restait bloqué sans jamais ni répondre ni renvoyer d'erreur — signe que
// l'attente se faisait AVANT même la moindre requête réseau, au niveau de
// ce verrou interne. Dans ce WebView précis, son initialisation ne
// s'est jamais terminée, gelant donc tout le moteur Firestore derrière
// elle. On retire cette persistence : on perd le cache instantané entre
// deux visites, mais on retrouve un SDK qui répond de façon fiable.
export const storage = getStorage(app);

// ⚠️ FIX : `getAnalytics(app)` était appelé de façon synchrone et
// inconditionnelle au chargement du module. Sur iOS (WKWebView via
// Capacitor), Firebase Analytics peut jeter une erreur synchrone
// ("browser doesn't support all required features") — non catchée,
// ce qui faisait échouer l'IMPORT ENTIER de ce fichier, donc `auth`/
// `db` n'étaient jamais initialisés et rien ne pouvait démarrer.
// Android tolère généralement cet appel, d'où le comportement différent.
// On applique désormais le même garde-fou que pour `messaging` :
// vérification async de support + try/catch, sans jamais bloquer ni
// faire planter l'initialisation du reste de Firebase.
export let analytics: ReturnType<typeof getAnalytics> | null = null;
let messaging: any = null;

// =====================================================
// PERSISTENCE (côté client uniquement)
// =====================================================

if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) =>
    console.error('[firebase] setPersistence a échoué:', err),
  );

  isSupported()
    .then((supported) => {
      if (supported) {
        messaging = getMessaging(app);
      }
    })
    .catch((err) => console.error('[firebase] messaging isSupported() a échoué:', err));

  analyticsIsSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(app);
    })
    .catch((err) => console.error('[firebase] analytics non initialisé (ignoré, non bloquant):', err));
}

// =====================================================
// CATÉGORIES
// =====================================================

export const PRODUCT_CATEGORIES = [
  'Tous',
  'Fruits',
  'Légumes',
  'Céréales',
  'Tubercules',
  'Légumineuses',
  'Épices',
  'Produits laitiers',
  'Viandes',
  'Poissons & Fruits de mer',
  'Boissons',
  'Produits transformés',
  'Semences & Agricole',
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

// =====================================================
// TYPES
// =====================================================

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  photoURL: string;
  role: 'client' | 'seller' | 'both' | 'admin';
  currentMode?: 'client' | 'seller' | 'admin';
  status: 'active' | 'suspended' | 'pending';
  emailVerified: boolean;
  phoneVerified: boolean;
  notificationToken?: string;
  sellerInfo?: {
    shopName: string;
    description: string;
    approved: boolean;
    verified: boolean;
    rating: number;
    totalSales: number;
    totalRevenue: number;
    joinedAt: Timestamp;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =====================================================
// SIGN UP
// =====================================================

export async function signUpUser(email: string, password: string, displayName: string, phone: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  await updateProfile(user, { displayName });

  const profile: UserProfile = {
    uid: user.uid,
    email,
    displayName,
    phone,
    photoURL: '',
    role: 'client',
    currentMode: 'client',
    status: 'active',
    emailVerified: false,
    phoneVerified: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await setDoc(doc(db, 'users', user.uid), profile);

  return { user, profile };
}

// =====================================================
// SIGN IN
// =====================================================

export async function signInUser(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

// =====================================================
// LOGOUT
// =====================================================

export async function logoutUser() {
  return signOut(auth);
}

// =====================================================
// RESET PASSWORD
// =====================================================

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

// =====================================================
// GET USER PROFILE
// =====================================================

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return null;
  return snapshot.data() as UserProfile;
}

// =====================================================
// UPDATE PROFILE
// =====================================================

export async function updateUserProfile(uid: string, data: Partial<UserProfile>) {
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// =====================================================
// DEVENIR VENDEUR
// =====================================================

export async function becomeSeller(uid: string, sellerInfo: { shopName: string; description: string }) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error('Utilisateur introuvable');

  const current = snap.data() as UserProfile;

  // DÉJÀ VENDEUR
  if (current.role === 'seller' || current.role === 'both') {
    await updateDoc(ref, {
      currentMode: 'seller',
      updatedAt: Timestamp.now(),
    });
    return;
  }

  // ADMIN
  if (current.role === 'admin') {
    await updateDoc(ref, {
      currentMode: 'admin',
      updatedAt: Timestamp.now(),
    });
    return;
  }

  // CLIENT -> BOTH
  await updateDoc(ref, {
    role: 'both',
    currentMode: 'seller',
    sellerInfo: {
      ...sellerInfo,
      approved: false,
      verified: false,
      rating: 0,
      totalSales: 0,
      totalRevenue: 0,
      joinedAt: Timestamp.now(),
    },
    updatedAt: Timestamp.now(),
  });
}

// =====================================================
// SWITCH MODE
// =====================================================

export async function switchUserMode(uid: string, mode: 'client' | 'seller') {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const user = snap.data() as UserProfile;

  // SÉCURITÉ
  if (mode === 'seller' && user.role !== 'both' && user.role !== 'seller') {
    return;
  }

  await updateDoc(ref, {
    currentMode: mode,
    updatedAt: Timestamp.now(),
  });
}

// =====================================================
// EXPORTS
// =====================================================

export {
  app,
  messaging,
  onAuthStateChanged,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  arrayUnion,
  arrayRemove,
  increment,
  Timestamp,
  writeBatch,
  getToken,
  onMessage,
};
