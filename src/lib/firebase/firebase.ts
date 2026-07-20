import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, Timestamp, arrayUnion, arrayRemove, increment, writeBatch } from 'firebase/firestore';
import { getStorage, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { getAnalytics, isSupported as analyticsIsSupported } from 'firebase/analytics';

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
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// ⚠️ FIX (v3 — retiré) : `enableIndexedDbPersistence(db)` avait été ajouté
// pour un affichage plus rapide au lancement, mais le diagnostic en direct
// (badge affiché sur l'app) a prouvé que :
//   - le réseau du téléphone est bien connecté,
//   - un accès direct à Firestore en HTTP simple répond correctement (200),
//   - MALGRÉ ÇA, le SDK Firestore (onSnapshot) restait bloqué indéfiniment.
// Ça isole le problème au moteur interne du SDK dans cette WebView — et le
// principal suspect est justement l'initialisation du cache IndexedDB
// (connue pour rester bloquée dans certains environnements Capacitor/
// WKWebView, ce qui peut geler tout le moteur de synchronisation interne de
// Firestore avant même qu'un seul onSnapshot ne puisse se déclencher).
// Le gain de vitesse voulu est de toute façon déjà obtenu autrement, via le
// cache localStorage ajouté sur la page Produits (lecture synchrone, encore
// plus rapide, et indépendant de ce mécanisme).

// ⚠️ FIX (v4 — la vraie cause) : le blocage est reproductible à 100% dans un
// cas précis, décrit très précisément par l'utilisateur : ouvrir l'app avec
// le wifi/4G DÉJÀ actif au lancement bloque tout indéfiniment, alors
// qu'ouvrir l'app SANS connexion puis l'activer ENSUITE, à l'intérieur de
// l'app, fonctionne. C'est la signature d'un problème bien identifié des
// WebViews iOS (WKWebView) : au tout premier lancement à froid, la pile
// réseau native (URLSession) n'a parfois pas fini de s'attacher au process
// au moment où la première requête part — cette toute première requête
// reste alors bloquée en silence, sans jamais aboutir ni échouer. Activer
// la connexion APRÈS le lancement fonctionne parce que ça déclenche un vrai
// évènement de changement réseau, qui force iOS à finaliser cette
// attache — exactement ce qu'on simule ici artificiellement.
//
// La parade : au tout premier chargement du module (donc avant que
// Firestore n'ait la moindre chance de tenter sa propre connexion), on
// envoie nous-mêmes une requête HTTP basique — la même que celle qui a déjà
// prouvé qu'elle passe même quand le SDK reste bloqué (voir le diagnostic
// en direct). Cette requête "réveille" la pile réseau native. Une fois
// qu'elle a abouti (ou échoué, peu importe — l'important est la tentative
// elle-même), le SDK Firestore peut établir sa propre connexion normalement.
//
// Exportée en promesse : les écrans critiques (Produits, Auth...) l'attendent
// explicitement avant de lancer leur premier appel Firestore/Auth réel, pour
// garantir l'ordre (et pas juste "lancé à peu près en même temps").
export const firestoreWarmupPromise: Promise<void> =
  typeof window !== 'undefined'
    ? Promise.race([
        fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/products?pageSize=1`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout réveil réseau (5s)')), 5000)),
      ])
        .then(() => { console.log('[firebase] Réveil réseau effectué avec succès'); })
        .catch((err) => { console.warn('[firebase] Réveil réseau échoué (non bloquant) :', err); })
    : Promise.resolve();

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

// ⚠️ FIX (la vraie cause du "invité au lieu de connecté") : `setPersistence`
// était lancé en fire-and-forget, sans jamais être attendu nulle part.
// `onAuthStateChanged` (dans useAuth.ts) démarre lui aussi immédiatement au
// montage — RIEN ne garantissait que `setPersistence` ait fini de configurer
// où Firebase doit chercher la session sauvegardée AVANT qu'`onAuthStateChanged`
// ne vérifie s'il y a un utilisateur. Si `onAuthStateChanged` "gagne" cette
// course, Firebase conclut "pas de session trouvée" et déclenche le callback
// avec `user = null` — l'utilisateur apparaît en invité alors que sa session
// existe bel et bien sur l'appareil. Ce timing dépend de facteurs externes
// (état du réseau, vitesse du device...), ce qui explique le comportement
// incohérent observé (parfois connecté, parfois invité selon l'état de la
// connexion au lancement).
//
// Exportée en promesse : useAuth.ts l'attend maintenant explicitement AVANT
// d'appeler onAuthStateChanged, éliminant cette course une fois pour toutes.
export const persistenceReadyPromise: Promise<void> =
  typeof window !== 'undefined'
    ? setPersistence(auth, browserLocalPersistence).catch((err) => {
        console.error('[firebase] setPersistence a échoué:', err);
      })
    : Promise.resolve();

if (typeof window !== 'undefined') {
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
