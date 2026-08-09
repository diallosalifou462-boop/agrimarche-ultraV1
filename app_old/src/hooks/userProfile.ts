'use client';

// src/lib/firebase/userProfile.ts
//
// Point d'entrée UNIQUE pour garantir qu'un document Firestore
// users/{uid} existe après une authentification Firebase (OTP téléphone,
// WhatsApp OTP → custom token, email/password...).
//
// ⚠️ POURQUOI CE FICHIER A DÛ ÊTRE CORRIGÉ (race condition) :
// useAuth() n'est PAS un React Context partagé — c'est un hook autonome
// (voir src/hooks/useAuth.ts), importé indépendamment dans ~30 fichiers
// (Navbar, useRole(), useFCMToken() via NotificationProvider, certaines
// pages...). Chaque instance de useAuth() monte SON PROPRE
// onAuthStateChanged. À la connexion, plusieurs instances se déclenchent
// donc quasi simultanément et appelaient chacune ensureUserExists(user)
// pour le MÊME uid, en parallèle.
//
// Scénario du bug "Missing or insufficient permissions" :
//   1. Deux appels concurrents font chacun getDoc() → tous deux voient
//      "le document n'existe pas encore".
//   2. Le premier fait setDoc() (création) → réussit.
//   3. Le second, dont le `createdAt` a été calculé une poignée de
//      millisecondes plus tôt (donc légèrement différent), fait AUSSI
//      setDoc() — mais le document existe déjà entre-temps : Firestore
//      reclasse cette seconde écriture en UPDATE, pas en création.
//   4. La règle Firestore interdit justement de modifier `createdAt` sur
//      update (doesNotChange(['uid','email','createdAt'])) → la seconde
//      écriture est rejetée avec "permission-denied", pile au moment de
//      la connexion. Intermittent, car ça ne se produit que si deux
//      appels se chevauchent d'assez près.
//
// FIX : un cache "in-flight" par uid. Peu importe combien de composants
// appellent ensureUserExists(user) en même temps, un seul getDoc+setDoc
// s'exécute réellement — tous les appelants attendent et reçoivent la
// même Promise/le même résultat. Plus aucune écriture concurrente
// possible sur le même document au même moment.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, waitForFirestoreReady, trace } from './firebase';

// ⚠️ FIX : getDoc()/setDoc() n'ont, par eux-mêmes, aucune limite de temps.
// Si le réseau est capricieux au cold-start (typique iOS/WKWebView),
// l'appel peut rester en attente indéfiniment sans jamais résoudre NI
// rejeter — ce qui bloquait silencieusement toute la chaîne d'appel
// (AuthContext, page.tsx) sans qu'aucun catch ne se déclenche jamais.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[ensureUserExists] Timeout (${ms}ms) sur ${label}`)), ms),
    ),
  ]);
}

// Filet de sécurité en plus de waitForFirestoreReady() : sur un réseau
// vraiment capricieux (coupures répétées au démarrage), même un getDoc()
// lancé après confirmation de synchronisation peut retomber sur "client
// is offline" si la connexion vient de retomber entre-temps. On retente
// alors 2 fois avec un court délai avant d'abandonner pour de bon.
async function getDocWithRetry(userRef: ReturnType<typeof doc>, attempt = 1): Promise<Awaited<ReturnType<typeof getDoc>>> {
  try {
    return await withTimeout(getDoc(userRef), 8000, `getDoc (essai ${attempt})`);
  } catch (error: any) {
    const isOffline = error?.code === 'unavailable' || /offline/i.test(error?.message ?? '');
    if (isOffline && attempt < 3) {
      console.warn(`[ensureUserExists] getDoc hors-ligne, nouvel essai dans ${attempt * 500}ms...`);
      await new Promise((r) => setTimeout(r, attempt * 500));
      return getDocWithRetry(userRef, attempt + 1);
    }
    throw error;
  }
}

export interface AppUserProfile {
  uid: string;
  email: string | null;
  phone: string;
  displayName: string;
  role: 'client' | 'seller' | 'admin' | 'delivery';
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

// Dédoublonnage des appels concurrents, par uid. Une entrée est retirée
// dès que l'opération se termine (succès ou échec), pour ne jamais
// bloquer une future reconnexion du même utilisateur.
const inFlight = new Map<string, Promise<AppUserProfile>>();

/**
 * Vérifie l'existence de users/{uid}. Le crée avec des valeurs par
 * défaut s'il n'existe pas encore. Retourne toujours le profil final.
 *
 * Idempotent et sûr à appeler à chaque connexion / changement d'état
 * d'authentification, y compris en cas d'appels concurrents pour le
 * même utilisateur (dédupliqués via `inFlight`) : si le document existe
 * déjà, il n'est jamais écrasé (aucun setDoc n'est déclenché).
 */
export async function ensureUserExists(user: User): Promise<AppUserProfile> {
  const existing = inFlight.get(user.uid);
  if (existing) return existing;

  const promise = (async () => {
    try {
      // ⚠️ FIX v5 : LA cause du bug rapporté en prod. On attend que
      // Firestore ait confirmé être synchronisé avec le serveur avant de
      // faire le tout premier getDoc() de la session — sinon ce getDoc()
      // échoue immédiatement avec "Failed to get document because the
      // client is offline", même sur un réseau qui fonctionne très bien,
      // simplement parce que le SDK n'a pas encore eu le temps de confirmer
      // son propre état de connexion en interne.
      trace('PROFIL', `ensureUserExists(${user.uid}) — attente waitForFirestoreReady()`);
      await waitForFirestoreReady();

      trace('PROFIL', `getDoc users/${user.uid}`);
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDocWithRetry(userRef);

      if (snap.exists()) {
        trace('PROFIL', 'profil existant trouvé');
        return snap.data() as AppUserProfile;
      }

      trace('PROFIL', 'aucun profil, création...');
      const now = new Date().toISOString();
      const defaultProfile: AppUserProfile = {
        uid: user.uid,
        email: user.email,
        phone: user.phoneNumber ?? '',
        displayName: user.displayName ?? '',
        role: 'client',
        createdAt: now,
        updatedAt: now,
      };

      // setDoc (et non merge) : à ce stade on sait que le document n'existe
      // pas (snap.exists() === false), donc Firestore traite cette écriture
      // comme une CREATION — ce qui correspond exactement à ce qu'exigent
      // les règles de sécurité (allow create: hasFields(['email','createdAt','role'])).
      await withTimeout(setDoc(userRef, defaultProfile), 8000, 'setDoc');
      console.log('[ensureUserExists] Profil créé avec succès');
      return defaultProfile;
    } catch (error) {
      console.error('[ensureUserExists] Échec:', error);
      throw error;
    } finally {
      inFlight.delete(user.uid);
    }
  })();

  inFlight.set(user.uid, promise);
  return promise;
}
