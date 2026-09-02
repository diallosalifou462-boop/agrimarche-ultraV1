// src/hooks/useUserLocation.ts
'use client';

import { useEffect, useState, useCallback } from 'react';
import { getCurrentPosition, type UnifiedPositionError } from '@/lib/geolocation';
import { reverseGeocode } from '@/lib/geo/geocode';
import { trace } from '@/lib/firebase/firebase';
import {
  getAnyCachedLocation,
  isLocationStale,
  setCachedLocation,
  type CachedUserLocation,
} from '@/lib/locationCache';

interface UserLocation {
  city: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  detected: boolean;
  address?: string;
  isDefault?: boolean;
}

function toUserLocation(c: CachedUserLocation): UserLocation {
  return {
    city: c.city || '',
    region: c.region || '',
    country: c.country || '',
    lat: c.lat,
    lng: c.lng,
    detected: c.detected ?? true,
    address: c.address,
    isDefault: c.isDefault,
  };
}

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation>({
    city: 'Chargement...',
    region: '',
    country: '',
    lat: 0,
    lng: 0,
    detected: false,
    isDefault: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const detectLocation = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // 1. Essayer le GPS en premier — natif (@capacitor/geolocation, via
      // FusedLocationProviderClient) sur Android/iOS, navigator.geolocation
      // sur web/PWA. Voir src/lib/geolocation.ts pour le détail. C'est la
      // source la plus précise (position réelle, pas juste la ville liée
      // au FAI) ; on ne se rabat sur l'IP que si le GPS échoue.
      try {
        trace('GEOLOC', 'tentative getCurrentPosition (GPS natif/web)...');
        const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        const { latitude, longitude } = position.coords;
        trace('GEOLOC', `GPS OK — lat=${latitude.toFixed(4)} lng=${longitude.toFixed(4)} accuracy=${position.coords.accuracy}`);

        try {
          const geocoded = await reverseGeocode(latitude, longitude);
          if (!geocoded) throw new Error('Erreur API');
          trace('GEOLOC', `reverse geocoding OK — ${geocoded.city || '?'}`);

          const city = geocoded.city || 'Dakar';
          const region = geocoded.region || city;
          const country = geocoded.country || 'Sénégal';

          const newLocation: UserLocation = {
            city,
            region,
            country,
            lat: latitude,
            lng: longitude,
            detected: true,
            address: `${city}, ${region}`,
            isDefault: false,
          };

          console.log(`📍 Localisation GPS : ${city}`);
          setLocation(newLocation);
          setCachedLocation(newLocation);
          setLoading(false);
          return newLocation;
        } catch (err) {
          trace('GEOLOC', 'reverse geocoding ÉCHEC (position GPS conservée quand même)', err);
          console.error('Erreur reverse geocoding:', err);
          const defaultLocation: UserLocation = {
            city: '📍 Position approximative',
            region: '',
            country: 'Sénégal',
            lat: latitude,
            lng: longitude,
            detected: true,
            isDefault: true,
          };
          setError('📍 Position approximative - activez la localisation pour plus de précision');
          setLocation(defaultLocation);
          // isDefault:true → jamais mis en cache comme fiable (voir setCachedLocation
          // et getFreshCachedLocation dans lib/locationCache.ts : une position isDefault
          // est toujours traitée comme périmée, donc inutile de l'écrire ici — on évite
          // simplement d'écraser une éventuelle position fiable encore fraîche en cache).
          setLoading(false);
          return defaultLocation;
        }
      } catch (geoErr) {
        // 2. GPS refusé/indisponible : on se rabat sur la géolocalisation IP
        // (moins précise, à l'échelle de la ville, mais mieux que rien).
        const code = (geoErr as UnifiedPositionError)?.code;
        const codeLabel = code === 1 ? 'PERMISSION_DENIED' : code === 3 ? 'TIMEOUT' : 'POSITION_UNAVAILABLE';
        trace('GEOLOC', `GPS ÉCHEC — code=${code} (${codeLabel}) message="${(geoErr as UnifiedPositionError)?.message}"`);
        console.warn('GPS indisponible, repli sur la géolocalisation IP:', geoErr);

        try {
          trace('GEOLOC', 'tentative repli IP (ipapi.co)...');
          const ipResponse = await fetch('https://ipapi.co/json/');
          trace('GEOLOC', `réponse ipapi.co : status=${ipResponse.status}`);

          if (ipResponse.ok) {
            const ipData = await ipResponse.json();

            if (ipData.latitude && ipData.longitude) {
              const city = ipData.city || 'Dakar';
              const region = ipData.region || city;
              const country = ipData.country_name || 'Sénégal';

              const newLocation: UserLocation = {
                city,
                region,
                country,
                lat: ipData.latitude,
                lng: ipData.longitude,
                detected: true,
                address: `${city}, ${region}`,
                isDefault: true,
              };

              console.log(`📍 Localisation détectée par IP (repli) : ${city}`);
              setError('📍 Position approximative (IP) - activez la localisation GPS pour plus de précision');
              setLocation(newLocation);
              // isDefault:true — jamais mis en cache comme fiable (précision à
              // l'échelle de la ville, parfois à plusieurs km du vrai point) :
              // sinon elle serait relue comme si elle était fiable à la
              // prochaine visite, sans jamais retenter le GPS.
              setLoading(false);
              return newLocation;
            }
          }
        } catch (ipErr) {
          trace('GEOLOC', 'repli IP ÉCHEC — fetch a levé une exception (réseau/CSP bloqué ?)', ipErr);
          console.error('Erreur géolocalisation IP:', ipErr);
        }

        trace('GEOLOC', 'GPS + IP tous deux en échec → repli sur Dakar par défaut');

        // 3. Ni GPS ni IP : position par défaut (Dakar).
        const denied = (geoErr as UnifiedPositionError)?.code === 1;
        const defaultLocation: UserLocation = {
          city: denied ? '📍 Ville non détectée' : '📍 Position approximative',
          region: '',
          country: 'Sénégal',
          lat: 14.7167,
          lng: -17.4677,
          detected: false,
          isDefault: true,
        };
        setError(
          denied
            ? '📍 Activez la localisation pour une géolocalisation précise'
            : '📍 Position approximative - activez la localisation pour plus de précision'
        );
        setLocation(defaultLocation);
        setLoading(false);
        return defaultLocation;
      }

    } catch (err) {
      console.error('Erreur détection localisation:', err);
      const defaultLocation: UserLocation = {
        city: '📍 Position approximative',
        region: '',
        country: 'Sénégal',
        lat: 14.7167,
        lng: -17.4677,
        detected: false,
        isDefault: true,
      };
      setError('📍 Position approximative - activez la localisation');
      setLocation(defaultLocation);
      setLoading(false);
      return defaultLocation;
    }
  }, []);

  useEffect(() => {
    // 🐛 BUG RÉEL corrigé ici (pas juste un commentaire) : l'ancien code
    // relisait la position en cache et l'affichait pour toujours, sans
    // jamais vérifier son âge — une position vieille de plusieurs jours
    // passait pour "la position exacte" actuelle. Cette app relit
    // désormais lib/locationCache.ts, la SEULE source de vérité partagée
    // avec app/product/page.tsx et app/main/products/page.tsx (avant ce
    // correctif, ces trois écrans avaient chacun leur propre cache
    // désynchronisé — voir lib/locationCache.ts pour le détail).
    const cached = getAnyCachedLocation();

    if (cached && !isLocationStale(cached)) {
      // Cache frais ET fiable (pas isDefault) : on l'utilise tel quel, pas
      // besoin de redemander le GPS.
      setLocation(toUserLocation(cached));
      setLoading(false);
      return;
    }

    if (cached) {
      // Cache périmé ou de repli : affichage instantané en attendant mieux,
      // mais une vraie redétection est systématiquement relancée derrière.
      setLocation(toUserLocation(cached));
      setLoading(true);
    }
    detectLocation();
  }, [detectLocation]);

  return { location, loading, error, detectLocation };
}
