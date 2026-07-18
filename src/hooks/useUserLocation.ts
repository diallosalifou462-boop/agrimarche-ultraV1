// src/hooks/useUserLocation.ts
'use client';

import { useEffect, useState, useCallback } from 'react';

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
      
      // 2. Fallback sur la géolocalisation du navigateur
      return new Promise<UserLocation>((resolve) => {
        if (!navigator.geolocation) {
          const defaultLocation: UserLocation = {
            city: '📍 Ville non détectée',
            region: '',
            country: 'Sénégal',
            lat: 14.7167,
            lng: -17.4677,
            detected: false,
            isDefault: true,
          };
          setError('📍 Activez la localisation pour une géolocalisation précise');
          setLocation(defaultLocation);
          setLoading(false);
          resolve(defaultLocation);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            
            try {
              const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=fr&zoom=18`
              );
              
              if (response.ok) {
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
                resolve(newLocation);
              } else {
                throw new Error('Erreur API');
              }
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
              resolve(defaultLocation);
            }
          },
          () => {
            // Si la géolocalisation échoue, on garde la position IP
            const defaultLocation: UserLocation = {
              city: '📍 Position approximative',
              region: '',
              country: 'Sénégal',
              lat: 14.7167,
              lng: -17.4677,
              detected: false,
              isDefault: true,
            };
            setError('📍 Position approximative - activez la localisation pour plus de précision');
            setLocation(defaultLocation);
            setLoading(false);
            resolve(defaultLocation);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      });
      
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
