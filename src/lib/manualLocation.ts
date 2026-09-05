/**
 * Source UNIQUE pour enregistrer/abandonner une adresse manuelle — quel que
 * soit l'endroit de l'app où le client la saisit.
 *
 * 🔒 FIX ARCHITECTURAL — avant ce module, trois écrans réimplémentaient
 * chacun leur propre version de "sauver une adresse manuelle", sans se
 * parler :
 *   1. components/LiveLocation.tsx (page /main/location)
 *   2. app/seller/dashboard/page.tsx (position du vendeur)
 *   3. app/checkout/page.tsx (pin de livraison, jamais persisté au-delà
 *      de la commande en cours)
 * Résultat concret pour le client : fixer son adresse à un endroit ne la
 * faisait apparaître nulle part ailleurs — ni dans le catalogue, ni au
 * checkout suivant, parfois même pas après un simple rechargement. Ce
 * module centralise l'écriture (cache local + Firestore) pour que les
 * trois écrans producteurs, et tous les écrans consommateurs (catalogue,
 * fiche produit, checkout — voir lib/locationCache.ts), voient exactement
 * la même adresse, jusqu'à modification explicite ou retour au GPS.
 */

import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { setCachedLocation, clearCachedLocation } from '@/lib/locationCache';
import { computeGeohash } from '@/lib/geo/geohash';

export interface ManualAddressInput {
  /** uid du profil à mettre à jour sur Firestore — omis pour un visiteur non connecté (le cache local suffit alors). */
  uid?: string | null;
  lat: number;
  lng: number;
  address: string;
}

/**
 * Enregistre une adresse manuelle. Écrit dans les DEUX sources lues par le
 * reste de l'app :
 *  - le cache local partagé (lib/locationCache.ts), avec isManual:true —
 *    effet immédiat sur cet appareil (catalogue, fiche produit, checkout),
 *    sans attendre un aller-retour réseau ;
 *  - le profil Firestore (users/{uid}), avec locationSource:'MANUAL_PIN' —
 *    persiste au-delà de cet appareil/session (LiveLocation.tsx au
 *    montage, admin, carte livreur...).
 * Best-effort côté Firestore : ne doit jamais bloquer l'affichage local si
 * l'écriture échoue (hors-ligne, visiteur non connecté...).
 */
export async function saveManualAddress({ uid, lat, lng, address }: ManualAddressInput): Promise<void> {
  setCachedLocation({
    lat,
    lng,
    city: address,
    region: '',
    country: 'Sénégal',
    address,
    detected: true,
    // ✅ Adresse confirmée explicitement par le client : ce n'est PAS une
    // position de repli.
    isDefault: false,
    // 🔒 Increvable par expiration tant que le client ne repasse pas en
    // mode auto — voir isLocationStale() dans lib/locationCache.ts.
    isManual: true,
  });

  if (!uid) return;
  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        lat,
        lng,
        geohash: computeGeohash(lat, lng),
        locationAddress: address,
        locationSource: 'MANUAL_PIN',
        locationUpdatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch {
    // best-effort — le cache local reste correct même si Firestore échoue.
  }
}

/**
 * Abandonne l'adresse manuelle et rend la main à la détection automatique
 * (GPS/IP) — utilisé par le bouton "Revenir au GPS auto".
 */
export async function clearManualAddress(uid?: string | null): Promise<void> {
  clearCachedLocation();
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid), { locationSource: 'GPS' }, { merge: true });
  } catch {
    // best-effort
  }
}
