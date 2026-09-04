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
  Edit3,
  Lock,
} from 'lucide-react';
import {
  getCurrentPosition,
  watchPosition,
  clearWatch,
  checkLocationPermission,
  type UnifiedPosition,
} from '@/lib/geolocation';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/firebase';
import { doc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { distanceKm } from '@/lib/geo/distance';
import { computeGeohash } from '@/lib/geo/geohash';
import { setCachedLocation } from '@/lib/locationCache';

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
  source: 'gps' | 'ip' | 'cache' | 'manual';
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
  const { user } = useAuth();
  const [location, setLocation] = useState<LocationData | null>(null);
  const [watchId, setWatchId] = useState<string | number | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [status, setStatus] = useState<'idle' | 'searching' | 'found' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [locationHistory, setLocationHistory] = useState<LocationData[]>([]);
  // ✅ NOUVEAU — throttle de l'écriture Firestore : watchPosition peut
  // déclencher updateLocation plusieurs fois par minute (mode suivi
  // continu). Sans throttle, chaque tick GPS écrirait sur users/{uid},
  // pour un bénéfice nul (personne ne regarde une carte "à la seconde
  // près"). 60s suffit largement pour que l'admin voie une position
  // à jour, sans spammer Firestore.
  const lastPersistRef = useRef<number>(0);
  // Dernière position réellement écrite sur Firestore : sert au filtre de
  // mouvement ci-dessous (voir updateLocation), pour ne pas ré-écrire quand
  // l'appareil est immobile — indépendant du throttle temporel 60s.
  const lastPersistedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // Seuil de mouvement en dessous duquel une position n'est pas considérée
  // comme "nouvelle" (bruit GPS typique à l'arrêt : 5-15m). Un livreur
  // immobile à un feu rouge ne doit pas spammer Firestore toutes les 60s.
  const MOVEMENT_THRESHOLD_METERS = 20;
  // Heartbeat : même sans mouvement, on force une écriture toutes les 5min
  // pour que l'admin sache que le suivi est toujours actif (et pas figé/mort).
  const HEARTBEAT_MS = 5 * 60_000;
  const [isLocating, setIsLocating] = useState(false);
  const watchIdRef = useRef<string | number | null>(null);
  const historyMax = 10;

  // ✅ NOUVEAU — Adresse saisie manuellement par le client.
  // Tant que `isManualRef.current` est vrai, TOUTE écriture GPS/IP
  // automatique (updateLocation, locateViaIP) est bloquée dès son entrée :
  // c'est ce garde-fou, testé de façon synchrone via une ref (pas un state,
  // qui serait asynchrone et pourrait laisser passer un tick GPS en vol),
  // qui garantit que l'adresse manuelle reste intacte partout (Firestore
  // users/{uid} → lu ensuite par admin, livreur, etc.) jusqu'à ce que le
  // client choisisse explicitement de revenir en mode automatique.
  const isManualRef = useRef(false);
  const [isManualLocation, setIsManualLocation] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manualCheckDone, setManualCheckDone] = useState(false);

  // Au montage : si le client avait déjà fixé une adresse manuelle
  // auparavant (locationSource === 'MANUAL_PIN' sur son profil), on la
  // recharge et on empêche toute détection GPS/IP automatique de la
  // remplacer au chargement de la page.
  useEffect(() => {
    if (!user?.uid) {
      setManualCheckDone(true);
      return;
    }
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        const data = snap.data();
        if (data?.locationSource === 'MANUAL_PIN' && data?.locationAddress) {
          isManualRef.current = true;
          setIsManualLocation(true);
          setManualAddress(data.locationAddress);
          setManualInput(data.locationAddress);
          setStatus('found');
          if (typeof data.lat === 'number' && typeof data.lng === 'number') {
            setLocation({
              lat: data.lat,
              lng: data.lng,
              accuracy: data.locationAccuracy ?? 0,
              altitude: null,
              speed: null,
              heading: null,
              timestamp: data.locationUpdatedAt?.toMillis?.() ?? Date.now(),
              address: {
                full: data.locationAddress, street: '', city: '', region: '',
                country: 'Sénégal', postalCode: '', neighborhood: '', landmark: '',
                locality: '', principalSubdivision: '', countryCode: 'SN',
              },
              status: 'found',
              source: 'manual',
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setManualCheckDone(true));
  }, [user?.uid]);

  // Vérifier la permission initiale (natif : @capacitor/geolocation ; web : Permissions API)
  useEffect(() => {
    // ⛔ Une adresse manuelle est déjà active : on ne lance surtout pas de
    // détection GPS/IP automatique qui viendrait l'écraser au chargement.
    if (isManualRef.current) return;
    checkLocationPermission().then((state) => {
      setPermissionState(state);
      // ✅ Aucune permission requise pour afficher une position : si le GPS
      // n'est pas déjà autorisé, on affiche immédiatement une position
      // approximative par IP au lieu de laisser l'écran bloqué sur "En
      // attente de localisation" tant que l'utilisateur n'a pas cliqué.
      if (state !== 'granted' && !isManualRef.current) {
        locateViaIP();
      }
    });

    // Web uniquement : réagit en direct si la permission change (ex : via
    // l'icône de cadenas du navigateur) sans attendre un nouveau check. Pas
    // d'équivalent fiable côté natif — le listener appStateChange plus bas
    // revérifie déjà au retour au premier plan, ce qui couvre le cas natif
    // (changement de permission via les Paramètres Android).
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((result) => {
          result.onchange = () => setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
        })
        .catch(() => {});
    }
  }, []);

  // Nettoyer le watch à la destruction
  useEffect(() => {
    return () => {
      clearWatch(watchIdRef.current);
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
  // BIGDATACLOUD - Localisation par IP (sans permission navigateur)
  // ============================================================
  // Le même endpoint que getAddressFromBigDataCloud, mais appelé SANS
  // latitude/longitude : BigDataCloud détecte alors la position à partir de
  // l'IP de la requête (précision ville/région, pas GPS). Ça permet d'avoir
  // une position par défaut même si l'utilisateur refuse — ou n'a jamais
  // encore répondu à — la demande de permission de géolocalisation.
  const getLocationFromIP = async (): Promise<LocationData | null> => {
    try {
      const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
      url.searchParams.set('localityLanguage', 'fr');

      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: BigDataCloudResponse = await response.json();
      if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
        return null;
      }

      const address = await getAddressFromBigDataCloud(data.latitude, data.longitude);

      return {
        lat: data.latitude,
        lng: data.longitude,
        // Précision par IP : de l'ordre de la ville, jamais du GPS — on
        // affiche une valeur volontairement large (5km) pour ne pas laisser
        // croire à une précision qu'on n'a pas.
        accuracy: 5000,
        altitude: null,
        speed: null,
        heading: null,
        timestamp: Date.now(),
        address,
        status: 'found',
        source: 'ip',
      };
    } catch (error) {
      console.error('Erreur localisation IP:', error);
      return null;
    }
  };

  // Localise via IP et met à jour l'état + Firestore, sans jamais demander
  // de permission au navigateur. Utilisé automatiquement au chargement et
  // en repli si le GPS est refusé/indisponible.
  const locateViaIP = useCallback(async () => {
    // ⛔ Adresse manuelle active : ne jamais l'écraser par une détection IP.
    if (isManualRef.current) return;
    setStatus('searching');
    const locationData = await getLocationFromIP();
    if (!locationData) {
      setStatus('error');
      setErrorMessage('Position indisponible pour le moment. Réessayez.');
      return;
    }

    setLocation(locationData);
    setStatus('found');
    setLastUpdate(new Date());
    setLocationHistory(prev => [locationData, ...prev].slice(0, historyMax));

    // isDefault:true — précision IP (~5km), jamais mise en cache comme
    // fiable au même titre qu'un vrai fix GPS (voir lib/locationCache.ts) :
    // sinon une position par IP pourrait bloquer une future tentative GPS
    // plus précise, ou s'afficher ailleurs comme "position exacte".
    setCachedLocation({
      lat: locationData.lat,
      lng: locationData.lng,
      city: locationData.address.city,
      region: locationData.address.region,
      country: locationData.address.country,
      address: locationData.address.full,
      detected: true,
      isDefault: true,
    });

    if (user?.uid && Date.now() - lastPersistRef.current > 60_000) {
      lastPersistRef.current = Date.now();
      updateDoc(doc(db, 'users', user.uid), {
        lat: locationData.lat,
        lng: locationData.lng,
        geohash: computeGeohash(locationData.lat, locationData.lng),
        locationAccuracy: locationData.accuracy,
        locationAddress: locationData.address.full,
        locationSource: 'IP_FALLBACK',
        locationUpdatedAt: Timestamp.now(),
      }).catch(() => {});
    }
  }, [user?.uid]);

  // ============================================================
  // Fonction principale de localisation
  // ============================================================
  const updateLocation = useCallback(async (position: UnifiedPosition, source: 'gps' | 'ip' = 'gps') => {
    // ⛔ Adresse manuelle active : ne jamais l'écraser par un fix GPS.
    if (isManualRef.current) return;
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

    // ✅ Alimente le cache partagé (lib/locationCache.ts) — cette page est
    // justement l'endroit où l'utilisateur détecte sa position le plus
    // explicitement, mais avant ce correctif elle n'écrivait QUE Firestore
    // (pour un compte connecté). Résultat concret : détecter sa position
    // ici n'aidait ni le checkout ni la fiche produit ni "Près de chez
    // vous" dans le catalogue, qui lisaient chacun leur propre cache
    // (voir lib/locationCache.ts pour l'historique des 3 caches
    // désynchronisés). Best-effort, marche aussi pour un visiteur non
    // connecté (contrairement à l'écriture Firestore ci-dessous).
    setCachedLocation({
      lat: latitude,
      lng: longitude,
      city: address.city,
      region: address.region,
      country: address.country,
      address: address.full || `${address.city || ''}${address.region ? ', ' + address.region : ''}`.trim(),
      detected: true,
      isDefault: source !== 'gps',
    });

    // ✅ NOUVEAU — recopie sur users/{uid}, comme checkout/page.tsx : cette
    // page (/main/location) est justement l'endroit où l'utilisateur détecte
    // sa position explicitement, donc c'est la source la plus fiable pour
    // alimenter la carte admin "Tous les utilisateurs". Throttle 60s,
    // best-effort (ne doit jamais casser l'affichage de la position si
    // l'écriture échoue), et seulement pour un compte connecté (pas de
    // profil à mettre à jour pour un visiteur non authentifié).
    if (user?.uid && Date.now() - lastPersistRef.current > 60_000) {
      const prev = lastPersistedCoordsRef.current;
      const movedMeters = prev ? distanceKm(prev.lat, prev.lng, latitude, longitude) * 1000 : Infinity;
      const dueForHeartbeat = Date.now() - lastPersistRef.current > HEARTBEAT_MS;

      if (movedMeters > MOVEMENT_THRESHOLD_METERS || dueForHeartbeat) {
        lastPersistRef.current = Date.now();
        lastPersistedCoordsRef.current = { lat: latitude, lng: longitude };
        updateDoc(doc(db, 'users', user.uid), {
          lat: latitude,
          lng: longitude,
          geohash: computeGeohash(latitude, longitude),
          locationAccuracy: accuracy ?? undefined,
          locationAddress: address.full || `${address.city || ''}${address.region ? ', ' + address.region : ''}`.trim() || undefined,
          locationSource: source === 'gps' ? 'GPS' : 'IP_FALLBACK',
          locationUpdatedAt: Timestamp.now(),
        }).catch(() => {});
      }
    }

    // Ajouter à l'historique
    setLocationHistory(prev => {
      const newHistory = [locationData, ...prev];
      return newHistory.slice(0, historyMax);
    });
  }, [user?.uid]);

  const startLocationTracking = useCallback(async () => {
    if (isManualRef.current) return;
    if (permissionState === 'denied') {
      // Le suivi en direct nécessite le GPS, mais l'absence de permission
      // ne doit jamais bloquer l'utilisateur : on affiche une position
      // approximative par IP à la place.
      locateViaIP();
      return;
    }

    setStatus('searching');
    setErrorMessage(null);
    setIsLocating(true);

    // Arrêter le watch existant
    if (watchIdRef.current !== null) {
      await clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Démarrer le watch avec haute précision — natif (@capacitor/geolocation)
    // ou web (navigator.geolocation) selon la plateforme, voir src/lib/geolocation.ts
    const id = await watchPosition(
      { enableHighAccuracy: true, timeout: 15000 },
      async (position, error) => {
        if (error) {
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

          // Le watch ne produira plus rien après une erreur de permission —
          // on l'arrête et on reflète l'état réel (sinon l'UI reste bloquée
          // sur "En attente" / "EN DIRECT" alors que la permission est bel
          // et bien refusée côté OS).
          if (error.code === 1) {
            setPermissionState('denied');
            clearWatch(watchIdRef.current);
            watchIdRef.current = null;
            setWatchId(null);
            setIsWatching(false);
            // Aucune permission → repli automatique sur la position IP,
            // plutôt que de laisser l'utilisateur sans aucune position.
            locateViaIP();
          }
          return;
        }
        if (position) {
          await updateLocation(position, 'gps');
          setIsLocating(false);
        }
      },
    );

    watchIdRef.current = id;
    setWatchId(id);
    setIsWatching(true);
  }, [permissionState, updateLocation, locateViaIP]);

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
          checkLocationPermission().then((state) => {
            setPermissionState(state);
            if (state === 'granted') startLocationTracking();
          });
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
      clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatchId(null);
    setIsWatching(false);
    setStatus('idle');
    setIsLocating(false);
  }, []);

  const getSingleLocation = useCallback(async () => {
    if (isManualRef.current) return;
    setStatus('searching');
    setErrorMessage(null);
    setIsLocating(true);

    try {
      const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      await updateLocation(position, 'gps');
      setIsLocating(false);
    } catch (error) {
      const err = error as { code?: 1 | 2 | 3; message?: string };
      setStatus('error');
      setErrorMessage(
        err.code === 1
          ? 'Activez votre position pour voir les produits proches de chez vous. Vous pouvez continuer sans la localisation.'
          : err.code === 3
          ? 'Délai de localisation dépassé. Réessayez.'
          : 'Position non disponible. Assurez-vous d\'avoir un signal GPS.'
      );
      if (err.code === 1) {
        setPermissionState('denied');
        // Aucune permission → repli automatique sur la position IP,
        // plutôt que de laisser l'utilisateur sans aucune position.
        locateViaIP();
      }
      console.error(error);
      setIsLocating(false);
    }
  }, [updateLocation, locateViaIP]);

  // ============================================================
  // Adresse manuelle — enregistrement / retour au mode automatique
  // ============================================================
  // Enregistre l'adresse saisie à la main par le client. Dès l'appel :
  //  1. tout suivi GPS en cours est arrêté (stopLocationTracking) ;
  //  2. isManualRef passe à true, ce qui bloque immédiatement toute future
  //     écriture GPS/IP (voir les gardes en tête de updateLocation /
  //     locateViaIP / startLocationTracking / getSingleLocation) ;
  //  3. Firestore users/{uid} est mis à jour avec locationSource:
  //     'MANUAL_PIN' — c'est CE champ que lisent déjà l'admin (badge
  //     "✏️ Manuelle") et, pour les commandes, checkout/page.tsx écrit le
  //     même flag sur customerLocation, lu tel quel par livreur/admin/
  //     tracking sans jamais être recalculé.
  const saveManualLocation = useCallback(async () => {
    const address = manualInput.trim();
    if (!address || !user?.uid) return;

    setSavingManual(true);
    stopLocationTracking();
    isManualRef.current = true;

    try {
      // On garde les dernières coordonnées connues (si on en a) pour ne pas
      // perdre la position sur la carte admin/livreur — seule l'ADRESSE
      // affichée change. Sans coordonnées connues, on ne touche pas lat/lng
      // existants plutôt que d'écrire 0,0 (Golfe de Guinée).
      const coords = location ? { lat: location.lat, lng: location.lng } : {};

      await updateDoc(doc(db, 'users', user.uid), {
        ...coords,
        locationAddress: address,
        locationSource: 'MANUAL_PIN',
        locationUpdatedAt: Timestamp.now(),
      });

      setLocation(prev => ({
        lat: prev?.lat ?? 0,
        lng: prev?.lng ?? 0,
        accuracy: prev?.accuracy ?? 0,
        altitude: null,
        speed: null,
        heading: null,
        timestamp: Date.now(),
        address: {
          full: address, street: '', city: '', region: '',
          country: 'Sénégal', postalCode: '', neighborhood: '', landmark: '',
          locality: '', principalSubdivision: '', countryCode: 'SN',
        },
        status: 'found',
        source: 'manual',
      }));
      setStatus('found');
      setLastUpdate(new Date());
      setIsManualLocation(true);
      setManualAddress(address);
      setShowManualForm(false);

      if (location) {
        setCachedLocation({
          lat: location.lat,
          lng: location.lng,
          city: address,
          region: '',
          country: 'Sénégal',
          address,
          detected: true,
          // ✅ Adresse confirmée explicitement par le client : ce n'est PAS
          // une position de repli, donc isDefault:false.
          isDefault: false,
        });
      }
    } catch (err) {
      console.error('Erreur enregistrement adresse manuelle:', err);
      isManualRef.current = false;
    } finally {
      setSavingManual(false);
    }
  }, [manualInput, user?.uid, location, stopLocationTracking]);

  // Abandonne l'adresse manuelle et relance la détection automatique.
  const resumeAutoLocation = useCallback(() => {
    isManualRef.current = false;
    setIsManualLocation(false);
    setManualAddress('');
    setManualInput('');
    setStatus('idle');
    setLocation(null);
    startLocationTracking();
  }, [startLocationTracking]);

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
            {isManualLocation ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/30 backdrop-blur-sm rounded-full text-[10px] text-white font-medium border border-violet-400/30">
                <Lock size={10} />
                MANUELLE
              </span>
            ) : isWatching ? (
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
            {isManualLocation ? (
              // ✅ Adresse manuelle active : le GPS est volontairement
              // désactivé (voir isManualRef dans les fonctions ci-dessus)
              // pour qu'il ne vienne jamais écraser l'adresse choisie par
              // le client. Il faut explicitement "revenir à l'automatique"
              // pour réactiver le GPS.
              <>
                <button
                  onClick={() => setShowManualForm(true)}
                  className="px-5 py-2.5 bg-violet-100 text-violet-700 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-violet-200 transition"
                >
                  <Edit3 size={16} />
                  Modifier l'adresse
                </button>
                <button
                  onClick={resumeAutoLocation}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-gray-200 transition"
                >
                  <RefreshCw size={16} />
                  Revenir au GPS auto
                </button>
              </>
            ) : (
              <>
                {/* Le GPS reste optionnel : ces boutons tentent une position
                   précise, mais s'ils échouent (permission refusée/indisponible),
                   locateViaIP() prend automatiquement le relais — aucun bouton
                   "obligatoire" à cliquer avant de voir une position. */}
                {!isWatching ? (
                  <button
                    onClick={startLocationTracking}
                    disabled={isLocating}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLocating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                    {permissionState === 'denied' ? 'Position précise (GPS)' : 'Suivre en direct'}
                  </button>
                ) : (
                  <button
                    onClick={stopLocationTracking}
                    className="px-5 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-red-600 transition"
                  >
                    Arrêter
                  </button>
                )}
                <button
                  onClick={getSingleLocation}
                  disabled={isLocating}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-gray-200 transition disabled:opacity-50"
                >
                  <RefreshCw size={16} className={isLocating ? 'animate-spin' : ''} />
                  {isLocating ? 'Recherche...' : 'Une fois'}
                </button>
                <button
                  onClick={() => { setManualInput(''); setShowManualForm(true); }}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-gray-200 transition"
                >
                  <Edit3 size={16} />
                  Saisir manuellement
                </button>
              </>
            )}
          </div>
        </div>

        {/* Formulaire de saisie manuelle */}
        {showManualForm && (
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
              <Edit3 size={13} />
              Saisir mon adresse manuellement
            </p>
            <p className="text-[11px] text-violet-600/80">
              Une fois confirmée, cette adresse sera utilisée partout (livreur, admin, suivi) et
              le GPS automatique sera arrêté pour ne pas l'écraser.
            </p>
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Ex : Villa 12, Cité Keur Gorgui, Dakar"
              className="w-full text-sm rounded-lg border border-violet-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <div className="flex gap-2">
              <button
                onClick={saveManualLocation}
                disabled={savingManual || !manualInput.trim()}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingManual ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirmer cette adresse
              </button>
              <button
                onClick={() => { setShowManualForm(false); setManualInput(manualAddress); }}
                className="px-4 py-2 bg-white text-gray-600 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 transition"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

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
                  {location.source === 'manual' && (
                    <span className="text-[8px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Lock size={9} /> Saisie manuelle
                    </span>
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
