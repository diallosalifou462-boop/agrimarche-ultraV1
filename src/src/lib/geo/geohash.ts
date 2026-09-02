/**
 * Indexation géospatiale pour requêtes Firestore "à proximité de X" sans
 * scanner toute une collection côté client.
 *
 * Firestore ne sait faire des requêtes d'intervalle (`>=`/`<=`) que sur UN
 * seul champ à la fois — impossible de faire directement
 * `where(lat between a,b).where(lng between c,d)`. La technique standard
 * (utilisée par Uber, et documentée par l'équipe Firebase elle-même) est
 * d'indexer chaque document avec un **geohash** : une chaîne où deux points
 * géographiquement proches ont un préfixe commun. On peut alors couvrir un
 * rayon avec un petit nombre de requêtes `where('geohash', '>=', a).where('geohash', '<=', b)`
 * en parallèle, dont l'union balaie très large mais reste bornée — beaucoup
 * moins de documents lus que "charger toute la collection et filtrer en JS"
 * (ce que faisait app/main/products/page.tsx jusqu'ici).
 *
 * On s'appuie sur `geofire-common` (https://github.com/firebase/geofire-common)
 * plutôt que de recoder l'algorithme à la main : le calcul des bornes de
 * requête (boundingBoxBits, wrapLongitude, etc.) est notoirement piégeux aux
 * pôles et à l'antiméridien, et cette lib est le standard de facto de
 * l'écosystème Firebase, maintenue et testée en conditions réelles.
 *
 * Installation requise : `npm install geofire-common`
 */

import { geohashForLocation, geohashQueryBounds, distanceBetween } from 'geofire-common';

/** Precision par défaut (9 caractères ≈ 5m — largement suffisant, cf. doc geofire-common). */
export function computeGeohash(lat: number, lng: number): string {
  return geohashForLocation([lat, lng]);
}

/**
 * Bornes de requêtes à passer à Firestore pour couvrir un cercle de
 * `radiusMeters` autour de `center`. Retourne plusieurs paires [start, end] :
 * il faut lancer UNE requête Firestore par paire (voir lib/geo/nearbyQuery.ts
 * pour le helper qui s'en charge), puis fusionner + dédupliquer les
 * résultats côté client — l'union des paires couvre toujours un peu plus
 * large que le cercle exact, donc un filtre de distance précis (distanceKm,
 * déjà dans lib/geo/distance.ts) reste nécessaire après coup.
 */
export function computeGeohashQueryBounds(
  center: { lat: number; lng: number },
  radiusMeters: number
): Array<[string, string]> {
  return geohashQueryBounds([center.lat, center.lng], radiusMeters);
}

/** Distance en km entre deux points — ré-export pratique de geofire-common (identique à distanceKm de distance.ts, formule Haversine). */
export function geoDistanceBetween(a: [number, number], b: [number, number]): number {
  return distanceBetween(a, b);
}
