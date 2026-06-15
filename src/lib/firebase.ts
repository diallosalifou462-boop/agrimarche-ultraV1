import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, Timestamp, arrayUnion, arrayRemove, increment, writeBatch } from 'firebase/firestore';
import { getStorage, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

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
export const db = getFirestore(app);
export const storage = getStorage(app);

let messaging: any = null;

// =====================================================
// PERSISTENCE (côté client uniquement)
// =====================================================

if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(console.error);

  isSupported().then((supported) => {
    if (supported) {
      messaging = getMessaging(app);
    }
  });
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