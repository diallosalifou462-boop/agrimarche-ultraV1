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
  postalCode?: string;
}

const parseJSON = <T,>(value: string | null): T | null => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation>({
    city: '',
    region: '',
    country: '',
    lat: 0,
    lng: 0,
    detected: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const detectLocation = useCallback(async () => {
    setLoading(true);
    setError('');

    return new Promise<UserLocation>((resolve) => {
      if (!navigator.geolocation) {
        setError('Géolocalisation non supportée');
        setLoading(false);
        resolve({
          city: 'Dakar',
          region: 'Dakar',
          country: 'Sénégal',
          lat: 14.7167,
          lng: -17.4677,
          detected: false,
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          try {
            // Reverse geocoding précis
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=fr&zoom=18`
            );
            const data = await response.json();

            const city = data.address?.city ||
                         data.address?.town ||
                         data.address?.village ||
                         data.address?.suburb ||
                         'Dakar';

            const region = data.address?.state ||
                           data.address?.region ||
                           data.address?.county ||
                           'Dakar';

            const country = data.address?.country || 'Sénégal';
            const postalCode = data.address?.postcode || '';
            const road = data.address?.road || '';
            const houseNumber = data.address?.house_number || '';
            const fullAddress = [houseNumber, road, city, postalCode]
              .filter(Boolean)
              .join(', ');

            const newLocation = {
              city,
              region,
              country,
              lat: latitude,
              lng: longitude,
              detected: true,
              address: fullAddress,
              postalCode,
            };

            setLocation(newLocation);
            localStorage.setItem('user_location', JSON.stringify(newLocation));
            setLoading(false);
            resolve(newLocation);
          } catch (err) {
            console.error('Erreur reverse geocoding:', err);
            const fallbackLocation = {
              city: 'Dakar',
              region: 'Dakar',
              country: 'Sénégal',
              lat: latitude,
              lng: longitude,
              detected: true,
            };
            setLocation(fallbackLocation);
            setLoading(false);
            resolve(fallbackLocation);
          }
        },
        (err) => {
          console.error('Erreur géolocalisation:', err);
          let errorMsg = '';
          switch (err.code) {
            case err.PERMISSION_DENIED:
              errorMsg = 'Activez la localisation pour une livraison précise';
              break;
            case err.POSITION_UNAVAILABLE:
              errorMsg = 'Position indisponible';
              break;
            case err.TIMEOUT:
              errorMsg = 'Délai dépassé';
              break;
            default:
              errorMsg = 'Erreur de localisation';
          }
          setError(errorMsg);
          setLoading(false);
          resolve({
            city: 'Dakar',
            region: 'Dakar',
            country: 'Sénégal',
            lat: 14.7167,
            lng: -17.4677,
            detected: false,
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  }, []);

  useEffect(() => {
    const savedLocation = parseJSON<UserLocation>(localStorage.getItem('user_location'));
    if (savedLocation && savedLocation.lat && savedLocation.lng) {
      setLocation(savedLocation);
      setLoading(false);
    } else {
      detectLocation();
    }
  }, [detectLocation]);

  return { location, loading, error, detectLocation };
}