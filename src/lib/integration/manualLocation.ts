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
 *
 * ✨ v3 — encore plus utile au quotidien :
 *   - un LABEL optionnel par adresse ("Maison", "Bureau"…) pour reconnaître
 *     une entrée d'historique d'un coup d'œil plutôt que de lire une chaîne
 *     d'adresse complète à chaque fois ;
 *   - une DÉDUPLICATION PAR PROXIMITÉ (40m) au lieu d'une égalité stricte de
 *     coordonnées : reposer un pin à quelques mètres du précédent (précision
 *     GPS/doigt qui tremble) ne crée plus une entrée d'historique en double,
 *     elle met à jour l'existante (et conserve son label s'il y en avait un) ;
 *   - un ABONNEMENT temps réel (`subscribeToManualAddress`) qui enveloppe
 *     l'évènement `manualaddresschange` dans une API plus simple à
 *     consommer (retourne directement une fonction de désabonnement, comme
 *     un `useEffect` React classique) ;
 *   - un FORMATAGE d'ancienneté (`formatManualAddressAge`) pour afficher
 *     "il y a 2 jours" plutôt qu'une date brute dans les chips d'historique.
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
  /** Étiquette optionnelle ("Maison", "Bureau"...) pour reconnaître l'adresse dans l'historique. */
  label?: string;
}

export interface ManualAddressResult {
  /** Écriture locale (cache) — quasi toujours vraie sauf coordonnées invalides. */
  local: boolean;
  /** Écriture Firestore réussie (ou non applicable si visiteur non connecté). */
  persisted: boolean;
  /** Raison de l'échec éventuel, pour un message d'erreur utile côté UI. */
  error?: 'invalid_coordinates' | 'empty_address' | 'firestore_failed';
}

export interface ManualAddressHistoryEntry {
  lat: number;
  lng: number;
  address: string;
  savedAt: number;
  label?: string;
}

const HISTORY_KEY = 'manualAddressHistory:v1';
const HISTORY_MAX = 5;
/** Deux pins à moins de cette distance sont considérés comme "la même adresse" dans l'historique. */
const HISTORY_DEDUPE_METERS = 40;
export const MANUAL_ADDRESS_EVENT = 'manualaddresschange';

type ManualAddressEventDetail =
  | { type: 'saved'; lat: number; lng: number; address: string; label?: string }
  | { type: 'cleared' };

function emitManualAddressEvent(detail: ManualAddressEventDetail): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<ManualAddressEventDetail>(MANUAL_ADDRESS_EVENT, { detail }));
  } catch {
    // best-effort — l'absence de CustomEvent (environnement non-DOM) ne doit
    // jamais empêcher la sauvegarde elle-même.
  }
}

/**
 * S'abonne aux changements d'adresse manuelle émis par ce module, où qu'ils
 * soient déclenchés dans l'app (LiveLocation, checkout, dashboard vendeur).
 * Retourne une fonction de désabonnement, à appeler par exemple dans le
 * cleanup d'un `useEffect` :
 *
 *   useEffect(() => subscribeToManualAddress((e) => {
 *     if (e.type === 'saved') setAddress(e.address);
 *   }), []);
 */
export function subscribeToManualAddress(
  callback: (detail: ManualAddressEventDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<ManualAddressEventDetail>;
    if (custom.detail) callback(custom.detail);
  };
  window.addEventListener(MANUAL_ADDRESS_EVENT, handler as EventListener);
  return () => window.removeEventListener(MANUAL_ADDRESS_EVENT, handler as EventListener);
}

/** Distance approximative en mètres entre deux points (formule haversine). */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Formate l'ancienneté d'une adresse d'historique en français, façon
 * "à l'instant" / "il y a 3h" / "il y a 5 jours", pour l'affichage dans les
 * chips d'adresses récentes plutôt qu'une date brute peu lisible.
 */
export function formatManualAddressAge(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}

/**
 * Coordonnées valides : nombres finis, dans les bornes du globe, et pas le
 * pin (0, 0) par défaut de nombreuses libs cartographiques (souvent le
 * signe d'un bug en amont plutôt qu'une vraie position au large du Ghana).
 */
function isValidCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

function readHistory(): ManualAddressHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: ManualAddressHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_MAX)));
  } catch {
    // quota dépassé / stockage désactivé — l'historique est un confort, pas
    // une source de vérité, donc on abandonne silencieusement.
  }
}

/**
 * Historique des dernières adresses manuelles confirmées par ce client sur
 * cet appareil (le plus récent en premier). Permet à chaque écran de
 * proposer un "re-choisir" en un tap plutôt que de retaper la même adresse.
 */
export function getManualAddressHistory(): ManualAddressHistoryEntry[] {
  return readHistory();
}

function pushHistory(entry: ManualAddressHistoryEntry): void {
  // ✨ v3 — déduplication par PROXIMITÉ plutôt que par égalité stricte des
  // coordonnées : un pin reposé à 5-10m du précédent (tremblement GPS/doigt)
  // remplaçait auparavant l'entrée en tête de liste au lieu de fusionner
  // avec elle, remplissant l'historique de quasi-doublons. On conserve
  // aussi le label existant si la nouvelle sauvegarde n'en fournit pas.
  const existing = readHistory();
  const match = existing.find(
    (e) => distanceMeters(e.lat, e.lng, entry.lat, entry.lng) <= HISTORY_DEDUPE_METERS
  );
  const merged: ManualAddressHistoryEntry = {
    ...entry,
    label: entry.label ?? match?.label,
  };
  const rest = existing.filter((e) => e !== match);
  writeHistory([merged, ...rest]);
}

/** Retire une entrée précise de l'historique (ex : bouton "supprimer"). */
export function removeManualAddressHistoryEntry(lat: number, lng: number): void {
  writeHistory(readHistory().filter((e) => !(e.lat === lat && e.lng === lng)));
}

/** Renomme/étiquette une entrée d'historique existante (ex : "Maison", "Bureau"). */
export function labelManualAddressHistoryEntry(lat: number, lng: number, label: string): void {
  writeHistory(
    readHistory().map((e) => (e.lat === lat && e.lng === lng ? { ...e, label: label.trim() || undefined } : e))
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistToFirestoreWithRetry(
  uid: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const delays = [0, 400, 1200];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await wait(delays[attempt]);
    try {
      await setDoc(doc(db, 'users', uid), payload, { merge: true });
      return true;
    } catch {
      // on retente avec le délai suivant ; au dernier essai on abandonne.
    }
  }
  return false;
}

/**
 * Enregistre une adresse manuelle. Écrit dans les DEUX sources lues par le
 * reste de l'app :
 *  - le cache local partagé (lib/locationCache.ts), avec isManual:true —
 *    effet immédiat sur cet appareil (catalogue, fiche produit, checkout),
 *    sans attendre un aller-retour réseau ;
 *  - le profil Firestore (users/{uid}), avec locationSource:'MANUAL_PIN' —
 *    persiste au-delà de cet appareil/session (LiveLocation.tsx au
 *    montage, admin, carte livreur...), avec 2 tentatives de retry en cas
 *    d'échec réseau transitoire avant de renoncer en best-effort.
 * Alimente aussi l'historique local (voir getManualAddressHistory) et émet
 * un évènement `manualaddresschange` (voir subscribeToManualAddress) pour
 * que tout composant monté ailleurs dans la page se resynchronise sans
 * attendre un remount.
 */
export async function saveManualAddress({
  uid,
  lat,
  lng,
  address,
  label,
}: ManualAddressInput): Promise<ManualAddressResult> {
  const cleanAddress = address.trim();
  const cleanLabel = label?.trim() || undefined;

  if (!isValidCoordinate(lat, lng)) {
    return { local: false, persisted: false, error: 'invalid_coordinates' };
  }
  if (!cleanAddress) {
    return { local: false, persisted: false, error: 'empty_address' };
  }

  setCachedLocation({
    lat,
    lng,
    city: cleanAddress,
    region: '',
    country: 'Sénégal',
    address: cleanAddress,
    detected: true,
    // ✅ Adresse confirmée explicitement par le client : ce n'est PAS une
    // position de repli.
    isDefault: false,
    // 🔒 Increvable par expiration tant que le client ne repasse pas en
    // mode auto — voir isLocationStale() dans lib/locationCache.ts.
    isManual: true,
  });

  pushHistory({ lat, lng, address: cleanAddress, savedAt: Date.now(), label: cleanLabel });
  emitManualAddressEvent({ type: 'saved', lat, lng, address: cleanAddress, label: cleanLabel });

  if (!uid) {
    return { local: true, persisted: false };
  }

  const persisted = await persistToFirestoreWithRetry(uid, {
    lat,
    lng,
    geohash: computeGeohash(lat, lng),
    locationAddress: cleanAddress,
    locationSource: 'MANUAL_PIN',
    locationUpdatedAt: Timestamp.now(),
  });

  return persisted
    ? { local: true, persisted: true }
    : { local: true, persisted: false, error: 'firestore_failed' };
}

/**
 * Abandonne l'adresse manuelle et rend la main à la détection automatique
 * (GPS/IP) — utilisé par le bouton "Revenir au GPS auto". L'historique
 * local est conservé (le client pourra vouloir reprendre une ancienne
 * adresse manuelle plus tard) : seul le mode actif change.
 */
export async function clearManualAddress(uid?: string | null): Promise<ManualAddressResult> {
  clearCachedLocation();
  emitManualAddressEvent({ type: 'cleared' });

  if (!uid) return { local: true, persisted: false };

  const persisted = await persistToFirestoreWithRetry(uid, { locationSource: 'GPS' });
  return persisted
    ? { local: true, persisted: true }
    : { local: true, persisted: false, error: 'firestore_failed' };
}

