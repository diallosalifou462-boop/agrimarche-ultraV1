/**
 * Types du système de géolocalisation AgriMarché.
 *
 * Historiquement, l'app ne stockait qu'une région/ville (texte libre, choisie
 * dans un menu déroulant) pour les vendeurs, et RIEN pour les produits —
 * `lat`/`lng` existaient bien dans les types (ProductData, main/products)
 * mais n'étaient jamais renseignés nulle part, donc les fonctionnalités de
 * distance/proximité déjà câblées dans le catalogue restaient silencieuses.
 *
 * Ce module pose les fondations d'un vrai système multi-lieux :
 *  - coordonnées GPS réelles + précision + provenance,
 *  - plusieurs lieux par vendeur (ferme, boutique, entrepôt, point de
 *    collecte…), chacun typé,
 *  - visibilité (position exacte vs approximative) pour la confidentialité,
 *  - vérification admin.
 *
 * ⚠️ Portée actuelle : ces types et les fonctions de src/lib/geo/ sont
 * utilisables dès maintenant (calcul de distance, géocodage, position GPS +
 * pin manuel). Le passage à une vraie sous-collection Firestore
 * `sellers/{id}/locations` avec plusieurs lieux simultanés, à une base
 * géospatiale indexée (type PostGIS) et à des zones de livraison complètes
 * est une évolution backend plus large, volontairement hors de ce lot —
 * les champs ci-dessous sont conçus pour y migrer sans tout casser.
 */

/** Type de lieu (permet de distinguer ferme, boutique, entrepôt, etc.) */
export type LocationType =
  | 'FARM'
  | 'SHOP'
  | 'WAREHOUSE'
  | 'COLLECTION_POINT'
  | 'MARKET'
  | 'DELIVERY_POINT'
  | 'OFFICE'
  | 'HOME'
  | 'OTHER';

/** Comment la position a été obtenue. */
export type LocationSource = 'GPS' | 'MAP_SEARCH' | 'MANUAL_PIN' | 'ADMIN' | 'GEOCODING' | 'IP_FALLBACK';

/**
 * Niveau de précision montré aux autres utilisateurs.
 *  - 'exact'        : coordonnées précises (le client peut s'y rendre).
 *  - 'approximate'  : la position réelle est floutée à l'affichage (ex. zone
 *    de quartier) — utile pour un producteur qui ne veut pas exposer son
 *    domicile exact tout en restant trouvable "à ~2 km de Keur Massar".
 */
export type LocationVisibility = 'exact' | 'approximate';

/** Une localisation complète, alignée sur la spec géolocalisation. */
export interface GeoLocation {
  id?: string;
  ownerId: string;
  type: LocationType;
  /** Nom lisible donné par le propriétaire, ex. "Ferme Ndiaye". */
  placeName?: string;
  latitude: number;
  longitude: number;
  /** Précision GPS en mètres, quand connue (voir UnifiedCoords.accuracy). */
  accuracy?: number;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  isVerified?: boolean;
  isPrimary?: boolean;
  visibility?: LocationVisibility;
  locationSource?: LocationSource;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Résultat d'un géocodage (adresse → coordonnées) ou d'une recherche de lieu. */
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
}

/** Résultat d'un géocodage inverse (coordonnées → adresse). */
export interface ReverseGeocodeResult {
  displayName: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  postalCode?: string;
}

/** Rayons de recherche proposés pour "produits/vendeurs près de moi". */
export const SEARCH_RADII_KM = [0.5, 1, 5, 10, 25, 50, 100] as const;
export type SearchRadiusKm = (typeof SEARCH_RADII_KM)[number];
