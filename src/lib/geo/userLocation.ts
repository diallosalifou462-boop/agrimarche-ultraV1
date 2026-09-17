'use client';

// ============================================================================
//  lib/geo/userLocation.ts — SEUL endroit qui enregistre une position sur un
//  compte. Deux notions distinctes, qui ne s'écrasent plus jamais :
//
//  1. Point de retrait du VENDEUR  → users/{uid}.lat / lng / locationAddress…
//     Écrit uniquement quand le vendeur l'enregistre lui-même (inscription
//     vendeur ou « Modifier ma position »). Recopié ensuite sur ses produits
//     et ses commandes pas encore récupérées par la function syncSellerLocation.
//
//  2. Adresse de livraison du CLIENT → users/{uid}.deliveryLocation
//     Écrite quand le client confirme une adresse (checkout, « Mon adresse »).
//     Pour un compte purement client, elle est aussi recopiée dans lat/lng
//     (carte admin). Pour un vendeur, JAMAIS : acheter ne déplace pas sa boutique.
// ============================================================================

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { computeGeohash } from '@/lib/geo/geohash';
import { setCachedLocation } from '@/lib/locationCache';
import { isUsableRecord, type LocationRecord, type LocationSource } from '@/lib/geo/quality';

function cleanRecord(rec: LocationRecord) {
  return {
    lat: rec.lat,
    lng: rec.lng,
    geohash: computeGeohash(rec.lat, rec.lng),
    accuracy: typeof rec.accuracy === 'number' ? Math.round(rec.accuracy) : null,
    source: rec.source,
    address: rec.address || '',
    ...(rec.city ? { city: rec.city } : {}),
    ...(rec.region ? { region: rec.region } : {}),
    ...(rec.instructions ? { instructions: rec.instructions.trim().slice(0, 300) } : {}),
  };
}

/** Garde la position en cache local (sections « près de chez vous »). */
export function cacheConfirmedLocation(rec: LocationRecord): void {
  setCachedLocation({
    lat: rec.lat,
    lng: rec.lng,
    city: rec.city,
    region: rec.region,
    country: 'Sénégal',
    address: rec.address,
    precision: typeof rec.accuracy === 'number' ? rec.accuracy : 30,
    detected: true,
    isDefault: false,
    pinned: true,
  });
}

/** Point de retrait d'un vendeur. */
export async function saveSellerShopLocation(uid: string, rec: LocationRecord): Promise<void> {
  if (!isUsableRecord(rec)) throw new Error('Position invalide');
  const c = cleanRecord(rec);
  await setDoc(
    doc(db, 'users', uid),
    {
      lat: c.lat,
      lng: c.lng,
      geohash: c.geohash,
      locationAddress: c.address,
      locationSource: c.source,
      locationAccuracy: c.accuracy,
      locationUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Adresse de livraison d'un client (ne touche jamais au point de retrait d'un vendeur). */
export async function saveDeliveryAddress(uid: string, rec: LocationRecord, role?: string | null): Promise<void> {
  if (!isUsableRecord(rec)) throw new Error('Adresse invalide');
  const c = cleanRecord(rec);
  const isPureClient = !role || role === 'client';
  await setDoc(
    doc(db, 'users', uid),
    {
      deliveryLocation: { ...c, updatedAt: serverTimestamp() },
      ...(isPureClient
        ? {
            lat: c.lat,
            lng: c.lng,
            geohash: c.geohash,
            locationAddress: c.address,
            locationSource: c.source as LocationSource,
            locationAccuracy: c.accuracy,
            locationUpdatedAt: serverTimestamp(),
          }
        : {}),
    },
    { merge: true },
  );
  cacheConfirmedLocation(rec);
}

/** Relit une adresse de livraison enregistrée (profil Firestore). */
export function readSavedDeliveryAddress(profile: any): LocationRecord | null {
  const d = profile?.deliveryLocation;
  if (!d || !isUsableRecord(d)) {
    // Adresse saisie AVANT cette mise à jour (ancien écran « Ma position »,
    // enregistrée dans lat/lng) : reprise pour un compte client, sauf si elle
    // venait d'une simple localisation par IP (non fiable).
    const isClient = !profile?.role || profile.role === 'client';
    const legacySources = ['MANUAL_PIN', 'MAP_SEARCH', 'GPS'];
    if (isClient && isUsableRecord({ lat: profile?.lat, lng: profile?.lng }) && legacySources.includes(profile?.locationSource)) {
      return {
        lat: profile.lat,
        lng: profile.lng,
        accuracy: typeof profile.locationAccuracy === 'number' ? profile.locationAccuracy : null,
        source: profile.locationSource as LocationSource,
        address: profile.locationAddress || `${profile.lat.toFixed(5)}, ${profile.lng.toFixed(5)}`,
      };
    }
    return null;
  }
  return {
    lat: d.lat,
    lng: d.lng,
    accuracy: typeof d.accuracy === 'number' ? d.accuracy : null,
    source: (d.source as LocationSource) || 'MANUAL_PIN',
    address: d.address || `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`,
    city: d.city,
    region: d.region,
    instructions: d.instructions,
  };
}

/** Relit le point de retrait enregistré d'un vendeur. */
export function readSellerShopLocation(profile: any): (LocationRecord & { updatedAtRaw?: unknown }) | null {
  if (!profile || !isUsableRecord({ lat: profile.lat, lng: profile.lng })) return null;
  return {
    lat: profile.lat,
    lng: profile.lng,
    accuracy: typeof profile.locationAccuracy === 'number' ? profile.locationAccuracy : null,
    source: (profile.locationSource as LocationSource) || 'GPS',
    address: profile.locationAddress || `${profile.lat.toFixed(5)}, ${profile.lng.toFixed(5)}`,
    updatedAtRaw: profile.locationUpdatedAt,
  };
}
