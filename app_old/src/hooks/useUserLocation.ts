// src/hooks/useUserLocation.ts
'use client';

import { useEffect, useState, useCallback } from 'react';
import { getCurrentPosition, type UnifiedPositionError } from '@/lib/geolocation';

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
      // 1. Essayer l'API IP geolocation (détecte la vraie ville)
      const ipResponse = await fetch('https://ipapi.co/json/');
      
      if (ipResponse.ok) {
        const ipData = await ipResponse.json();
        
        if (ipData.latitude && ipData.longitude) {
          // IP détectée - ville réelle (Thiès, Dakar, etc.)
          const city = ipData.city || 'Dakar';
          const region = ipData.region || city;
          const country = ipData.country_name || 'Sénégal';
          
          const newLocation: UserLocation = {
            city: city,
            region: region,
            country: country,
            lat: ipData.latitude,
            lng: ipData.longitude,
            detected: true,
            address: `${city}, ${region}`,
            isDefault: false,
          };
          
          console.log(`📍 Localisation détectée par IP : ${city}`);
          setLocation(newLocation);
          localStorage.setItem('user_location', JSON.stringify(newLocation));
          setLoading(false);
          return newLocation;
        }
      }
      
      // 2. Fallback sur la géolocalisation — natif (@capacitor/geolocation,
      // via FusedLocationProviderClient) sur Android/iOS, navigator.geolocation
      // sur web/PWA. Voir src/lib/geolocation.ts pour le détail : c'était la
      // cause du blocage total sur Android (permissions manifest manquantes
      // + pont WebView non fiable).
      try {
        const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        const { latitude, longitude } = position.coords;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=fr&zoom=18`
          );

          if (!response.ok) throw new Error('Erreur API');

          const data = await response.json();
          const city = data.address?.city || data.address?.town || data.address?.village || 'Dakar';
          const region = data.address?.state || data.address?.region || city;
          const country = data.address?.country || 'Sénégal';

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
          localStorage.setItem('user_location', JSON.stringify(newLocation));
          setLoading(false);
          return newLocation;
        } catch (err) {
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
          setLoading(false);
          return defaultLocation;
        }
      } catch (geoErr) {
        // GPS refusé/indisponible (natif ou web) : on garde la position par défaut.
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
    const saved = localStorage.getItem('user_location');
    const savedLocation = saved ? JSON.parse(saved) : null;
    
    if (savedLocation?.lat && savedLocation?.lng) {
      setLocation(savedLocation);
      setLoading(false);
    } else {
      detectLocation();
    }
  }, [detectLocation]);

  return { location, loading, error, detectLocation };
}
