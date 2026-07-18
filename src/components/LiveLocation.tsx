'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Compass,
  Target,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  LocateFixed,
  Eye,
  Clock,
  Globe,
  Building2,
  Home,
  Shield,
  Zap,
} from 'lucide-react';

interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
  address: {
    full: string;
    street: string;
    city: string;
    region: string;
    country: string;
    postalCode: string;
    neighborhood: string;
    landmark: string;
    locality: string;
    principalSubdivision: string;
    countryCode: string;
  };
  status: 'idle' | 'searching' | 'found' | 'error';
  errorMessage?: string;
  source: 'gps' | 'ip' | 'cache';
}

interface BigDataCloudResponse {
  latitude: number;
  longitude: number;
  locality: string;
  city: string;
  principalSubdivision: string;
  countryName: string;
  countryCode: string;
  postcode: string;
  plusCode: string;
  localityInfo: {
    administrative: Array<{
      name: string;
      description: string;
      order: number;
      adminLevel: number;
      isoCode?: string;
    }>;
    informative: Array<{
      name: string;
      description: string;
      order: number;
    }>;
  };
}

export function LiveLocation() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [status, setStatus] = useState<'idle' | 'searching' | 'found' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [locationHistory, setLocationHistory] = useState<LocationData[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const historyMax = 10;

  // Vérifier la permission initiale
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
        result.onchange = () => {
          setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
        };
      });
    }
  }, []);

  // Nettoyer le watch à la destruction
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // ============================================================
  // BIGDATACLOUD - Reverse Geocoding
  // ============================================================
  const getAddressFromBigDataCloud = async (lat: number, lng: number): Promise<LocationData['address']> => {
    try {
      const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lng));
      url.searchParams.set('localityLanguage', 'fr');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AgriMarche/2.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: BigDataCloudResponse = await response.json();

      // Extraction des données avec fallbacks
      const city = data.city || data.locality || '';
      const region = data.principalSubdivision || '';
      const country = data.countryName || 'Sénégal';
      const countryCode = data.countryCode || 'SN';
      const postalCode = data.postcode || '';
      const locality = data.locality || '';

      // Trouver le quartier / sous-quartier
      let neighborhood = '';
      let landmark = '';
      let street = '';

      // Recherche dans les données administratives pour trouver le quartier
      if (data.localityInfo?.administrative) {
        const adminLevels = data.localityInfo.administrative;
        // Niveau 4 = quartier, niveau 3 = commune, niveau 2 = département
        const quarter = adminLevels.find(a => a.adminLevel === 4);
        const commune = adminLevels.find(a => a.adminLevel === 3);
        const departement = adminLevels.find(a => a.adminLevel === 2);

        if (quarter?.name) neighborhood = quarter.name;
        else if (commune?.name) neighborhood = commune.name;
        else if (departement?.name) neighborhood = departement.name;
      }

      // Détection des zones spécifiques du Sénégal
      const isDiamniadio = (lat: number, lng: number): boolean => {
        return (lat >= 14.700 && lat <= 14.740) && (lng >= -17.220 && lng <= -17.170);
      };
      const isRufisque = (lat: number, lng: number): boolean => {
        return (lat >= 14.710 && lat <= 14.730) && (lng >= -17.280 && lng <= -17.240);
      };
      const isPikine = (lat: number, lng: number): boolean => {
        return (lat >= 14.730 && lat <= 14.760) && (lng >= -17.400 && lng <= -17.350);
      };

      let finalCity = city;
      if (isDiamniadio(lat, lng) && !city.includes('Diamniadio')) {
        finalCity = 'Diamniadio';
        neighborhood = 'Diamniadio';
      } else if (isRufisque(lat, lng) && !city.includes('Rufisque')) {
        finalCity = 'Rufisque';
        neighborhood = 'Rufisque';
      } else if (isPikine(lat, lng) && !city.includes('Pikine')) {
        finalCity = 'Pikine';
        neighborhood = 'Pikine';
      }

      // Construction de l'adresse complète
      const parts = [];
      if (landmark) parts.push(landmark);
      else if (street) parts.push(street);
      if (neighborhood && neighborhood !== landmark && neighborhood !== street) {
        parts.push(neighborhood);
      }
      if (finalCity && finalCity !== neighborhood) {
        parts.push(finalCity);
      }
      if (region && region !== finalCity) {
        parts.push(region);
      }
      parts.push(country);

      const full = parts.filter(Boolean).join(', ') || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

      return {
        full,
        street: street || '',
        city: finalCity || locality || '',
        region: region || '',
        country: country || 'Sénégal',
        postalCode: postalCode || '',
        neighborhood: neighborhood || '',
        landmark: landmark || '',
        locality: locality || '',
        principalSubdivision: region || '',
        countryCode: countryCode || 'SN',
      };
    } catch (error) {
      console.error('Erreur BigDataCloud:', error);
      // Fallback sur un format simple
      return {
        full: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        street: '',
        city: 'Sénégal',
        region: '',
        country: 'Sénégal',
        postalCode: '',
        neighborhood: '',
        landmark: '',
        locality: '',
        principalSubdivision: '',
        countryCode: 'SN',
      };
    }
  };

  // ============================================================
  // Fonction principale de localisation
  // ============================================================
  const updateLocation = useCallback(async (position: GeolocationPosition, source: 'gps' | 'ip' = 'gps') => {
    const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;

    const address = await getAddressFromBigDataCloud(latitude, longitude);

    const locationData: LocationData = {
      lat: latitude,
      lng: longitude,
      accuracy: accuracy,
      altitude: altitude || null,
      speed: speed || null,
      heading: heading || null,
      timestamp: position.timestamp,
      address: address,
      status: 'found',
      source,
    };

    setLocation(locationData);
    setStatus('found');
    setLastUpdate(new Date());

    // Ajouter à l'historique
    setLocationHistory(prev => {
      const newHistory = [locationData, ...prev];
      return newHistory.slice(0, historyMax);
    });
  }, []);

  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      setErrorMessage('Votre navigateur ne supporte pas la géolocalisation.');
      return;
    }

    if (permissionState === 'denied') {
      setStatus('error');
      setErrorMessage('Activez votre position pour voir les produits proches de chez vous. Vous pouvez continuer sans la localisation.');
      return;
    }

    setStatus('searching');
    setErrorMessage(null);
    setIsLocating(true);

    // Arrêter le watch existant
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Démarrer le watch avec haute précision
    const id = navigator.geolocation.watchPosition(
      async (position) => {
        await updateLocation(position, 'gps');
        setIsLocating(false);
      },
      (error) => {
        console.error('Erreur GPS:', error);
        setStatus('error');
        setErrorMessage(
          error.code === 1
            ? 'Activez votre position pour voir les produits proches de chez vous. Vous pouvez continuer sans la localisation.'
            : error.code === 2
            ? 'Position non disponible. Assurez-vous d\'avoir un signal GPS.'
            : error.code === 3
            ? 'Délai de localisation dépassé. Réessayez.'
            : 'Erreur de localisation.'
        );
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    watchIdRef.current = id;
    setWatchId(id);
    setIsWatching(true);
  }, [permissionState, updateLocation]);

  // Ouvre directement l'écran des paramètres de l'application (permission localisation)
  const openAppSettings = useCallback(async () => {
    try {
      const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings');
      await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.App,
      });
    } catch (err) {
      console.error("Impossible d'ouvrir les paramètres de l'application :", err);
    }
  }, []);

  // Quand l'utilisateur revient dans l'app (ex: après avoir activé la permission
  // dans les paramètres), on revérifie l'état et on relance la localisation
  // automatiquement si elle est désormais autorisée.
  useEffect(() => {
    let removeListener: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) return;
          if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
            navigator.permissions.query({ name: 'geolocation' }).then((result) => {
              setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
              if (result.state === 'granted') startLocationTracking();
            });
          }
        });
        removeListener = () => handle.remove();
      } catch (err) {
        // @capacitor/app indisponible (build web) — pas de détection de retour
      }
    })();

    return () => removeListener?.();
  }, [startLocationTracking]);

  const stopLocationTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatchId(null);
    setIsWatching(false);
    setStatus('idle');
    setIsLocating(false);
  }, []);

  const getSingleLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      setErrorMessage('Géolocalisation non supportée.');
      return;
    }

    setStatus('searching');
    setErrorMessage(null);
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await updateLocation(position, 'gps');
        setIsLocating(false);
      },
      (error) => {
        setStatus('error');
        setErrorMessage('Impossible d\'obtenir la position.');
        console.error(error);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [updateLocation]);

  // ============================================================
  // Formateurs
  // ============================================================
  const formatDistance = (meters: number): string => {
    if (meters < 1) return '< 1m';
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatSpeed = (speed: number | null): string => {
    if (speed === null) return '0 km/h';
    const kmh = speed * 3.6;
    return `${kmh.toFixed(1)} km/h`;
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // ============================================================
  // Rendu
  // ============================================================
  const getStatusIcon = () => {
    switch (status) {
      case 'searching':
        return <Loader2 size={20} className="animate-spin text-amber-500" />;
      case 'found':
        return <CheckCircle size={20} className="text-emerald-500" />;
      case 'error':
        return <AlertCircle size={20} className="text-red-500" />;
      default:
        return <MapPin size={20} className="text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return 'En attente de localisation';
      case 'searching':
        return 'Recherche de la position...';
      case 'found':
        return `Position trouvée (précision ${formatDistance(location?.accuracy || 0)})`;
      case 'error':
        return errorMessage || 'Erreur de localisation';
      default:
        return 'Statut inconnu';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'idle':
        return 'text-gray-400';
      case 'searching':
        return 'text-amber-500';
      case 'found':
        return 'text-emerald-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      {/* Header - Version Pro */}
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Navigation size={22} className="text-white" />
              </div>
              {isWatching && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-white text-xl tracking-tight">Localisation Pro</h3>
              <p className="text-emerald-100 text-xs flex items-center gap-2">
                <Globe size={12} />
                Sénégal · GPS Haute Précision
                {location?.source === 'gps' && (
                  <span className="flex items-center gap-1 text-[10px] bg-green-500/30 px-2 py-0.5 rounded-full">
                    <Zap size={10} /> GPS
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isWatching ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/30 backdrop-blur-sm rounded-full text-[10px] text-white font-medium border border-green-400/30">
                <span className="w-1.5 h-1.5 bg-green-300 rounded-full animate-pulse" />
                EN DIRECT
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-500/30 backdrop-blur-sm rounded-full text-[10px] text-white/60 font-medium">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                INACTIF
              </span>
            )}
            {location && (
              <span className="flex items-center gap-1 text-[10px] text-white/60 bg-white/10 px-2 py-1 rounded-full">
                <Clock size={12} />
                {formatTime(location.timestamp)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="p-6 space-y-5">
        {/* Statut et contrôle */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <p className={`text-sm font-medium ${getStatusColor()}`}>{getStatusText()}</p>
              {lastUpdate && (
                <p className="text-[10px] text-gray-400">
                  Dernière mise à jour : {lastUpdate.toLocaleTimeString('fr-FR')}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {permissionState === 'denied' ? (
              <button
                onClick={openAppSettings}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
              >
                <LocateFixed size={16} />
                Activer
              </button>
            ) : !isWatching ? (
              <button
                onClick={startLocationTracking}
                disabled={isLocating}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLocating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                Suivre en direct
              </button>
            ) : (
              <button
                onClick={stopLocationTracking}
                className="px-5 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-red-600 transition"
              >
                Arrêter
              </button>
            )}
            {permissionState !== 'denied' && (
              <button
                onClick={getSingleLocation}
                disabled={isLocating}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-gray-200 transition disabled:opacity-50"
              >
                <RefreshCw size={16} className={isLocating ? 'animate-spin' : ''} />
                {isLocating ? 'Recherche...' : 'Une fois'}
              </button>
            )}
          </div>
        </div>

        {/* Affichage des coordonnées - Style Pro */}
        {location && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-3 text-center border border-emerald-100/50">
              <p className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wider">Latitude</p>
              <p className="font-mono font-bold text-emerald-700 text-sm">{location.lat.toFixed(6)}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-3 text-center border border-emerald-100/50">
              <p className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wider">Longitude</p>
              <p className="font-mono font-bold text-emerald-700 text-sm">{location.lng.toFixed(6)}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-3 text-center border border-amber-100/50">
              <p className="text-[9px] text-amber-600 font-semibold uppercase tracking-wider">Précision</p>
              <p className="font-mono font-bold text-amber-700 text-sm">{formatDistance(location.accuracy)}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-3 text-center border border-blue-100/50">
              <p className="text-[9px] text-blue-600 font-semibold uppercase tracking-wider">Vitesse</p>
              <p className="font-mono font-bold text-blue-700 text-sm">{formatSpeed(location.speed)}</p>
            </div>
          </div>
        )}

        {/* Adresse complète - BigDataCloud */}
        {location && (
          <div className="bg-gradient-to-r from-emerald-50 via-white to-teal-50 rounded-xl p-5 border border-emerald-100/50 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <MapPin size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider bg-emerald-100/50 px-2 py-0.5 rounded-full">
                    Adresse complète
                  </span>
                  {location.source === 'gps' && (
                    <span className="text-[8px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">GPS</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-800 mt-1">{location.address.full}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 text-xs text-gray-500">
                  {location.address.city && (
                    <span className="flex items-center gap-1">
                      <Building2 size={12} className="text-emerald-500" />
                      {location.address.city}
                    </span>
                  )}
                  {location.address.region && (
                    <span className="flex items-center gap-1">
                      <Globe size={12} className="text-emerald-500" />
                      {location.address.region}
                    </span>
                  )}
                  {location.address.neighborhood && (
                    <span className="flex items-center gap-1 col-span-full">
                      <Home size={12} className="text-emerald-500" />
                      Quartier : {location.address.neighborhood}
                    </span>
                  )}
                  {location.address.postalCode && (
                    <span className="flex items-center gap-1">
                      📮 {location.address.postalCode}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Historique des positions */}
        {locationHistory.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Historique ({locationHistory.length})
              </span>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {locationHistory.map((loc, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px] text-gray-500 border-b border-gray-50 py-1.5">
                  <span className="font-mono text-emerald-600">
                    {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                  </span>
                  <span className="text-gray-400">
                    {formatTime(loc.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Statut de permission */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            {permissionState === 'granted' ? (
              <Shield size={14} className="text-emerald-500" />
            ) : permissionState === 'denied' ? (
              <AlertCircle size={14} className="text-red-500" />
            ) : (
              <AlertCircle size={14} className="text-amber-500" />
            )}
            <span className="text-xs text-gray-500">
              Permission : {permissionState === 'granted' ? '✅ Autorisée' : permissionState === 'denied' ? '❌ Refusée' : '⏳ En attente'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {location && (
              <span className="text-[10px] text-gray-400 font-mono">
                {location.address.countryCode || 'SN'}
              </span>
            )}
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-[10px] text-gray-400">
              v2.0 · BigDataCloud
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
