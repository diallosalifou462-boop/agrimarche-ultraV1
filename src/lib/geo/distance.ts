/**
 * Calculs de distance géographique — centralisés ici pour remplacer les
 * multiples copies de la formule de Haversine dispersées dans le code
 * (main/products/page.tsx, admin/page.tsx, DeliveryTracker.tsx…). Un seul
 * endroit à corriger/optimiser si un jour on bascule sur des requêtes
 * géospatiales côté serveur (voir note en tête de src/lib/geo/types.ts).
 */

export { SEARCH_RADII_KM } from './types';

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distance en kilomètres entre deux points GPS (formule de Haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Vérifie que des coordonnées GPS sont dans les bornes valides. */
export function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

/**
 * Filtre + trie une liste d'éléments géolocalisés par proximité à un point
 * de référence. Les éléments sans coordonnées valides sont exclus.
 */
export function nearbySorted<T extends { lat?: number; lng?: number }>(
  items: T[],
  origin: { lat: number; lng: number },
  radiusKm?: number
): Array<T & { distanceKm: number }> {
  return items
    .filter((it): it is T & { lat: number; lng: number } => isValidCoordinate(it.lat, it.lng))
    .map(it => ({ ...it, distanceKm: distanceKm(origin.lat, origin.lng, it.lat, it.lng) }))
    .filter(it => (radiusKm ? it.distanceKm <= radiusKm : true))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Formatage lisible d'une distance : "850 m", "3,7 km", "42 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/**
 * "Floute" une position pour un affichage en visibilité approximative :
 * décale le point d'un petit offset pseudo-aléatoire mais stable (dérivé des
 * coordonnées d'origine), pour ne jamais révéler la position exacte tout en
 * gardant un point cohérent d'un affichage à l'autre.
 */
export function fuzzLocation(lat: number, lng: number, radiusMeters = 400): { lat: number; lng: number } {
  const seed = Math.abs(Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453) % 1;
  const angle = seed * Math.PI * 2;
  const distDeg = (radiusMeters / 111_320); // ~mètres par degré de latitude
  return {
    lat: lat + Math.cos(angle) * distDeg,
    lng: lng + Math.sin(angle) * distDeg,
  };
}
