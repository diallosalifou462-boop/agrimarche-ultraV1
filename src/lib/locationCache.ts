/**
 * Source UNIQUE de vérité pour la position utilisateur mise en cache
 * localement (localStorage).
 *
 * ⚠️ CORRECTIF ARCHITECTURAL — avant ce module, la position acheteur était
 * lue/écrite indépendamment à 3 endroits :
 *   1. hooks/useUserLocation.ts   → clé 'user_location'   (checkout)
 *   2. app/product/page.tsx       → clé 'user_location'   (2ème écrivain !)
 *   3. app/main/products/page.tsx → clé 'agrimarche_location' (catalogue)
 * Résultat : trois "vérités" différentes selon la page visitée, et aucune
 * expiration — une position GPS vieille de plusieurs semaines pouvait
 * s'afficher comme "exacte" indéfiniment. Ce module centralise lecture,
 * écriture et fraîcheur en un seul endroit, sur une seule clé
 * ('agrimarche_user_location'), pour que TOUTES les pages voient la même
 * position, avec la même règle de péremption.
 */

const STORAGE_KEY = 'agrimarche_user_location';
/** Au-delà de cette ancienneté, une position en cache n'est plus considérée fiable. */
export const LOCATION_STALE_MS = 10 * 60 * 1000; // 10 minutes

export interface CachedUserLocation {
  lat: number;
  lng: number;
  city?: string;
  region?: string;
  country?: string;
  address?: string;
  detailedAddress?: string;
  precision?: number;
  detected?: boolean;
  /** true = position de repli (IP/défaut Dakar), jamais aussi fiable qu'un vrai fix GPS. */
  isDefault?: boolean;
  /** Horodatage de mise en cache — c'est ce champ qui permet l'expiration. */
  cachedAt: number;
}

/** Lit la position en cache si elle est encore fraîche ET fiable (pas isDefault). */
export function getFreshCachedLocation(): CachedUserLocation | null {
  const parsed = readRaw();
  if (!parsed) return null;
  if (parsed.isDefault) return null;
  if (Date.now() - parsed.cachedAt > LOCATION_STALE_MS) return null;
  return parsed;
}

/**
 * Lit la position en cache même si elle est périmée ou de repli — utile
 * pour un affichage instantané pendant qu'une redétection tourne en
 * arrière-plan, plutôt que de laisser l'UI vide. Le champ `cachedAt`
 * permet à l'appelant de savoir si une redétection est nécessaire.
 */
export function getAnyCachedLocation(): CachedUserLocation | null {
  return readRaw();
}

export function isLocationStale(loc: Pick<CachedUserLocation, 'cachedAt' | 'isDefault'> | null): boolean {
  if (!loc) return true;
  if (loc.isDefault) return true;
  return Date.now() - loc.cachedAt > LOCATION_STALE_MS;
}

export function setCachedLocation(loc: Omit<CachedUserLocation, 'cachedAt'>): void {
  try {
    const withTimestamp: CachedUserLocation = { ...loc, cachedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withTimestamp));
  } catch {
    // best-effort — un quota localStorage plein ne doit jamais casser l'app
  }
}

export function clearCachedLocation(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readRaw(): CachedUserLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat !== 'number' || typeof parsed?.lng !== 'number') return null;
    // Position enregistrée par une ancienne version du code (avant ce
    // module, pas de `cachedAt`) : traitée comme périmée par défaut plutôt
    // que de planter ou d'être prise pour une position fraîche.
    if (typeof parsed.cachedAt !== 'number') return { ...parsed, cachedAt: 0 };
    return parsed;
  } catch {
    return null;
  }
}
