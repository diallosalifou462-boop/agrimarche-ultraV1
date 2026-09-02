'use client';

// =====================================================
// GÉOLOCALISATION UNIFIÉE — web (navigator.geolocation) / natif (@capacitor/geolocation)
// =====================================================
//
// ⚠️ CAUSE DU BUG ANDROID : useUserLocation.ts et LiveLocation.tsx
// utilisaient exclusivement `navigator.geolocation`, l'API web standard.
// Dans la WebView Android de Capacitor, cette API dépend d'un pont
// (`WebChromeClient.onGeolocationPermissionsShowPrompt`) qui n'est pas
// garanti selon la version de WebView/Capacitor — contrairement à iOS où
// WKWebView expose `navigator.geolocation` de façon beaucoup plus fiable.
// En plus, sans les permissions ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION
// dans AndroidManifest.xml (absentes jusqu'ici), la requête échoue
// systématiquement — silencieusement, sans erreur exploitable côté JS.
//
// Ce module bascule sur `@capacitor/geolocation` (plugin officiel, qui
// parle directement à FusedLocationProviderClient côté Android et gère
// lui-même les permissions runtime) dès qu'on tourne sur natif, et garde
// l'API web intacte sur navigateur/PWA — avec la MÊME interface pour les
// deux, pour ne toucher qu'un seul endroit si un jour ça bouge encore.
//
// Prérequis : `npm install @capacitor/geolocation && npx cap sync android`

import { Capacitor } from '@capacitor/core';

export interface UnifiedCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface UnifiedPosition {
  coords: UnifiedCoords;
  timestamp: number;
}

// Alignés sur les codes standards de GeolocationPositionError (web), pour
// que le code appelant existant (qui teste error.code === 1/2/3) continue
// de fonctionner sans changement, que la position vienne du natif ou du web.
export interface UnifiedPositionError {
  code: 1 | 2 | 3; // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
  message: string;
}

export type LocationPermissionState = 'granted' | 'denied' | 'prompt';

const isNative = () => typeof window !== 'undefined' && Capacitor.isNativePlatform();

function toUnifiedPosition(pos: any): UnifiedPosition {
  const c = pos.coords;
  return {
    coords: {
      latitude: c.latitude,
      longitude: c.longitude,
      accuracy: c.accuracy,
      altitude: c.altitude ?? null,
      altitudeAccuracy: c.altitudeAccuracy ?? null,
      heading: c.heading ?? null,
      speed: c.speed ?? null,
    },
    timestamp: pos.timestamp ?? Date.now(),
  };
}

// Les erreurs du plugin natif sont des `{ message: string }` génériques,
// pas des codes standardisés — on les remappe au mieux sur 1/2/3 en
// inspectant le message, pour que le code appelant garde la même logique
// que sur le web.
function normalizeNativeError(err: any): UnifiedPositionError {
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('denied') || msg.includes('permission')) {
    return { code: 1, message: err?.message || 'Permission refusée.' };
  }
  if (msg.includes('timeout')) {
    return { code: 3, message: err?.message || 'Délai dépassé.' };
  }
  return { code: 2, message: err?.message || 'Position indisponible.' };
}

export async function checkLocationPermission(): Promise<LocationPermissionState> {
  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const status = await Geolocation.checkPermissions();
    if (status.location === 'granted' || status.coarseLocation === 'granted') return 'granted';
    if (status.location === 'denied' && status.coarseLocation === 'denied') return 'denied';
    return 'prompt';
  }
  if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return result.state as LocationPermissionState;
    } catch {
      return 'prompt';
    }
  }
  return 'prompt';
}

export async function requestLocationPermission(): Promise<LocationPermissionState> {
  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const status = await Geolocation.requestPermissions();
    if (status.location === 'granted' || status.coarseLocation === 'granted') return 'granted';
    return 'denied';
  }
  // Sur le web il n'y a pas de méthode "requestPermission" explicite : le
  // popup du navigateur apparaît directement au premier appel de
  // getCurrentPosition/watchPosition.
  return checkLocationPermission();
}

export function getCurrentPosition(options?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}): Promise<UnifiedPosition> {
  const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0, ...options };

  if (isNative()) {
    return import('@capacitor/geolocation').then(({ Geolocation }) =>
      Geolocation.getCurrentPosition(opts)
        .then(toUnifiedPosition)
        .catch((err) => {
          throw normalizeNativeError(err);
        }),
    );
  }

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({ code: 2, message: 'Géolocalisation non supportée par ce navigateur.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toUnifiedPosition(pos)),
      (err) => reject({ code: err.code, message: err.message }),
      opts,
    );
  });
}

// Renvoie un id de watch — string côté natif, number côté web. Le stocker
// tel quel et le repasser à clearWatch() sans le manipuler.
export async function watchPosition(
  options: { enableHighAccuracy?: boolean; timeout?: number },
  onUpdate: (position: UnifiedPosition | null, error: UnifiedPositionError | null) => void,
): Promise<string | number> {
  const opts = { enableHighAccuracy: true, timeout: 15000, ...options };

  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    return Geolocation.watchPosition(opts, (pos, err) => {
      if (err) {
        onUpdate(null, normalizeNativeError(err));
        return;
      }
      if (pos) onUpdate(toUnifiedPosition(pos), null);
    });
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onUpdate(null, { code: 2, message: 'Géolocalisation non supportée par ce navigateur.' });
    return -1;
  }

  return navigator.geolocation.watchPosition(
    (pos) => onUpdate(toUnifiedPosition(pos), null),
    (err) => onUpdate(null, { code: err.code as 1 | 2 | 3, message: err.message }),
    { ...opts, maximumAge: 0 },
  );
}

export async function clearWatch(watchId: string | number | null): Promise<void> {
  if (watchId === null) return;

  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    await Geolocation.clearWatch({ id: String(watchId) });
    return;
  }

  if (typeof watchId === 'number' && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
}
