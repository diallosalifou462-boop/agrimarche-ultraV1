'use client';

// ============================================================================
//  lib/geo/quality.ts — règles de localisation COMMUNES à toute l'app
//  (client, vendeur, livreur, admin). Un seul endroit décide :
//   - ce qu'est une position GPS « précise », « approximative » ou inutilisable ;
//   - comment obtenir le MEILLEUR point GPS (pas le premier, souvent grossier) ;
//   - comment une position est enregistrée (même forme partout).
// ============================================================================

import { watchPosition, clearWatch, type UnifiedPosition, type UnifiedPositionError } from '@/lib/geolocation';
import { isPlausibleSenegalCoordinate } from '@/lib/geo/distance';
import type { ReverseGeocodeResult } from '@/lib/geo/types';

/** Centre de Dakar — utilisé UNIQUEMENT comme repli signalé (isDefault: true). */
export const DAKAR_CENTER = { lat: 14.7167, lng: -17.4677 } as const;

/** ≤ 50 m : on s'arrête d'attendre, le point est excellent. */
export const GPS_TARGET_ACCURACY_M = 50;
/** ≤ 100 m : précis — utilisable tel quel. */
export const GPS_PRECISE_ACCURACY_M = 100;
/** ≤ 1000 m : approximatif — l'utilisateur doit confirmer le point sur la carte. */
export const GPS_APPROX_ACCURACY_M = 1000;

/** Le GPS brut compte ~1,3× moins de distance que la route réelle au Sénégal. */
export const ROAD_DISTANCE_FACTOR = 1.3;

export type LocationSource =
  | 'GPS'          // point GPS précis, pris par l'utilisateur
  | 'MANUAL_PIN'   // point placé / corrigé à la main sur la carte
  | 'MAP_SEARCH'   // lieu choisi dans la recherche d'adresse
  | 'GPS_LIVE'     // position en direct d'un livreur
  | 'ADMIN';       // corrigé par un admin

export type GpsQuality = 'precise' | 'approximate' | 'unusable';

export function classifyAccuracy(accuracy: number | null | undefined): GpsQuality {
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) return 'approximate';
  if (accuracy <= GPS_PRECISE_ACCURACY_M) return 'precise';
  if (accuracy <= GPS_APPROX_ACCURACY_M) return 'approximate';
  return 'unusable';
}

/** Position choisie/confirmée par un utilisateur — même forme partout. */
export interface LocationRecord {
  lat: number;
  lng: number;
  /** Précision GPS en mètres ; null pour un point placé à la main. */
  accuracy: number | null;
  source: LocationSource;
  /** Adresse lisible (quartier, ville). */
  address: string;
  city?: string;
  region?: string;
  /** Repère libre pour le livreur (« portail bleu, près de la mosquée »). */
  instructions?: string;
}

export function isUsableRecord(r: Partial<LocationRecord> | null | undefined): r is LocationRecord {
  return !!r && isPlausibleSenegalCoordinate(r.lat, r.lng);
}

/** Adresse courte et lisible à partir du géocodage inverse. */
export function formatReverseAddress(r: ReverseGeocodeResult | null, lat: number, lng: number): string {
  if (!r) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const parts = [r.address, r.neighborhood, r.city || r.region].filter(Boolean) as string[];
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.join(', ') || r.displayName || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Millisecondes depuis une date stockée en Timestamp Firestore, Date, ISO ou nombre. */
export function toMillis(raw: unknown): number | null {
  if (!raw) return null;
  if (typeof (raw as any)?.toMillis === 'function') return (raw as any).toMillis();
  if (typeof (raw as any)?.seconds === 'number') return (raw as any).seconds * 1000;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export class GpsError extends Error {
  code: 'permission' | 'unavailable' | 'timeout' | 'outside';
  constructor(code: GpsError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export function gpsErrorMessage(err: unknown): string {
  const code = (err as GpsError)?.code;
  if (code === 'permission') return 'Localisation refusée. Autorisez-la dans les réglages, ou placez le point sur la carte.';
  if (code === 'timeout') return 'Le GPS ne répond pas. Sortez à découvert ou placez le point sur la carte.';
  if (code === 'outside') return 'La position détectée est hors du Sénégal. Placez le point sur la carte.';
  return 'Position indisponible. Placez le point sur la carte.';
}

/**
 * Meilleur point GPS sur une courte fenêtre.
 * Le PREMIER point d'un téléphone vient souvent du réseau (±1–3 km) ; les
 * suivants s'affinent. On écoute jusqu'à `maxWaitMs` et on garde le plus
 * précis, en s'arrêtant dès qu'on atteint `targetAccuracy`.
 */
export function getBestGpsFix(opts: {
  maxWaitMs?: number;
  targetAccuracy?: number;
  onProgress?: (accuracy: number) => void;
} = {}): Promise<{ lat: number; lng: number; accuracy: number }> {
  const maxWaitMs = opts.maxWaitMs ?? 15000;
  const target = opts.targetAccuracy ?? GPS_TARGET_ACCURACY_M;

  return new Promise((resolve, reject) => {
    let best: UnifiedPosition | null = null;
    let lastError: UnifiedPositionError | null = null;
    let watchId: string | number | null = null;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearWatch(watchId).catch(() => {});
      if (best) {
        const { latitude, longitude, accuracy } = best.coords;
        if (!isPlausibleSenegalCoordinate(latitude, longitude)) {
          reject(new GpsError('outside', 'Position hors du Sénégal'));
          return;
        }
        resolve({ lat: latitude, lng: longitude, accuracy });
        return;
      }
      if (lastError?.code === 1) reject(new GpsError('permission', lastError.message));
      else if (lastError?.code === 2) reject(new GpsError('unavailable', lastError.message));
      else reject(new GpsError('timeout', 'Aucun point GPS reçu'));
    };

    const timer = setTimeout(finish, maxWaitMs);

    watchPosition({ enableHighAccuracy: true, timeout: maxWaitMs }, (pos, err) => {
      if (done) return;
      if (err) {
        lastError = err;
        if (err.code === 1) finish(); // refus : inutile d'attendre
        return;
      }
      if (!pos) return;
      if (!best || pos.coords.accuracy < best.coords.accuracy) {
        best = pos;
        opts.onProgress?.(pos.coords.accuracy);
      }
      if (pos.coords.accuracy <= target) finish();
    })
      .then((id) => {
        watchId = id;
        if (done) clearWatch(id).catch(() => {});
      })
      .catch((e) => {
        lastError = { code: 2, message: String(e?.message || e) };
        finish();
      });
  });
}
