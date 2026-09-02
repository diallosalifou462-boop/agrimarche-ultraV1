/**
 * Géocodage, géocodage inverse et recherche de lieux.
 *
 * Fournisseur : OpenStreetMap Nominatim — choisi pour rester cohérent avec
 * le reste de la stack cartographique déjà utilisée dans le projet
 * (react-leaflet + tuiles OSM dans MapInner.tsx, routage OSRM dans
 * DeliveryTracker), sans ajouter de clé API ni de dépendance payante.
 *
 * ⚠️ Nominatim impose une politique d'usage raisonnable (≈1 req/s, User-Agent
 * identifiable, pas de gros volume). Cette implémentation convient pour du
 * développement et un usage modéré ; si AgriMarché grandit, prévoir de faire
 * transiter ces appels par un petit endpoint backend (cache + throttling),
 * comme évoqué dans src/lib/geo/types.ts — l'interface publique ci-dessous
 * ne changerait pas, seule l'implémentation basculerait vers ce endpoint.
 * Voir aussi le point 31 de la spec : l'app ne doit pas dépendre en dur d'un
 * seul fournisseur — ces fonctions sont le point d'entrée unique à modifier
 * pour changer de fournisseur plus tard (Google Maps, Mapbox…).
 */

import type { GeocodeResult, ReverseGeocodeResult } from './types';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// Limité au Sénégal par défaut — pertinent pour AgriMarché, évite des
// résultats hors zone sur des noms de lieux ambigus. `countryCode: null`
// permet de désactiver ce filtre si besoin (recherche internationale).
const DEFAULT_COUNTRY_CODES = 'sn';

// Cache mémoire simple (le point 33 de la spec) : évite de refaire un appel
// réseau identique plusieurs fois pendant la même session (ex. l'utilisateur
// rouvre deux fois la même fiche vendeur).
const geocodeCache = new Map<string, GeocodeResult[]>();
const reverseCache = new Map<string, ReverseGeocodeResult>();

function roundCoord(n: number): number {
  // ~11m de précision — suffisant pour dédupliquer les appels de reverse
  // geocoding sans fausser l'affichage.
  return Math.round(n * 10000) / 10000;
}

interface NominatimAddress {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
  country_code?: string;
  postcode?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

function pickCity(a?: NominatimAddress): string | undefined {
  return a?.city || a?.town || a?.village || a?.county;
}

function pickRegion(a?: NominatimAddress): string | undefined {
  return a?.state || a?.region;
}

/**
 * Transforme une adresse/nom de lieu en coordonnées GPS (géocodage direct).
 * Ex. geocodeAddress("Keur Massar, Dakar") → { latitude, longitude, ... }
 *
 * Retourne plusieurs résultats possibles (l'appelant choisit, ou prend le
 * premier) car un même nom peut correspondre à plusieurs lieux.
 */
export async function geocodeAddress(
  query: string,
  opts: { limit?: number; countryCodes?: string | null } = {}
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${q.toLowerCase()}|${opts.limit ?? 5}|${opts.countryCodes ?? DEFAULT_COUNTRY_CODES}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!;

  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(opts.limit ?? 5),
  });
  const countryCodes = opts.countryCodes === null ? undefined : (opts.countryCodes ?? DEFAULT_COUNTRY_CODES);
  if (countryCodes) params.set('countrycodes', countryCodes);

  try {
    const res = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data: NominatimResult[] = await res.json();

    const results: GeocodeResult[] = data.map(r => ({
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      displayName: r.display_name,
      address: r.address?.road,
      city: pickCity(r.address),
      region: pickRegion(r.address),
      country: r.address?.country,
      postalCode: r.address?.postcode,
    }));

    geocodeCache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.warn('[geo] geocodeAddress a échoué :', err);
    return [];
  }
}

/**
 * Transforme des coordonnées GPS en adresse lisible (géocodage inverse).
 * Utilisé typiquement juste après avoir obtenu la position GPS d'un
 * vendeur/acheteur, pour lui proposer "Vous êtes à Grand Yoff, Dakar" plutôt
 * que d'afficher des chiffres bruts.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ReverseGeocodeResult | null> {
  const cacheKey = `${roundCoord(latitude)},${roundCoord(longitude)}`;
  if (reverseCache.has(cacheKey)) return reverseCache.get(cacheKey)!;

  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '16',
  });

  try {
    const res = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const r: NominatimResult = await res.json();

    const result: ReverseGeocodeResult = {
      displayName: r.display_name,
      address: r.address?.road,
      neighborhood: r.address?.neighbourhood || r.address?.suburb || r.address?.quarter,
      city: pickCity(r.address),
      region: pickRegion(r.address),
      country: r.address?.country,
      countryCode: r.address?.country_code,
      postalCode: r.address?.postcode,
    };

    reverseCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn('[geo] reverseGeocode a échoué :', err);
    return null;
  }
}

/**
 * Recherche de lieux façon "barre de recherche Yango" : un nom partiel
 * ("Ferme Ndiaye", "Grand Yoff") renvoie une liste de suggestions
 * cliquables. Alias sémantique de geocodeAddress avec plus de résultats,
 * pensé pour être branché directement sur un champ de recherche.
 */
export async function searchPlaces(query: string, limit = 6): Promise<GeocodeResult[]> {
  return geocodeAddress(query, { limit });
}
