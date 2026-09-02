'use client';

import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pinIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface LocationPickerInnerProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  zoom?: number;
}

/**
 * 🐛 CORRECTIF — "Map container is already initialized"
 *
 * Cette erreur venait de <MapContainer> (react-leaflet) : en dev, avec Fast
 * Refresh/Turbopack (et le double-appel d'effets de React Strict Mode), le
 * composant peut être ré-exécuté sur le MÊME nœud DOM sans que le
 * `map.remove()` interne de react-leaflet ait fini de nettoyer avant la
 * nouvelle tentative — Leaflet pose un flag `_leaflet_id` sur le conteneur
 * et refuse catégoriquement un second `L.map()` dessus tant qu'il y est.
 *
 * Plutôt que de dépendre du timing de nettoyage interne de react-leaflet
 * (hors de notre contrôle), ce composant gère Leaflet en impératif, avec un
 * garde explicite — exactement le même principe déjà utilisé avec succès
 * ailleurs dans cette app (voir TrackingMap dans app/tracking/page.tsx :
 * `if (!mapRef.current || instanceRef.current) return;`). Deux garde-fous :
 *   1. `instanceRef` : on ne recrée jamais une carte si l'effet a déjà
 *      tourné pour ce composant monté (couvre le cas normal).
 *   2. `container._leaflet_id` : filet de sécurité si jamais un ancien
 *      conteneur DOM était malgré tout réutilisé (Fast Refresh) — on le
 *      nettoie nous-mêmes avant de laisser Leaflet réessayer, au lieu de
 *      planter toute l'app avec une Runtime Error.
 */
export default function LocationPickerInner({ lat, lng, onChange, zoom = 15 }: LocationPickerInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleChange = useCallback((newLat: number, newLng: number) => {
    onChangeRef.current(newLat, newLng);
  }, []);

  // ─── Création (une seule fois) ───────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || instanceRef.current) return;

    // Filet de sécurité Fast Refresh (voir commentaire ci-dessus) : un
    // conteneur déjà marqué par un précédent montage non nettoyé est purgé
    // avant de laisser Leaflet y créer une nouvelle carte, au lieu de
    // planter avec "Map container is already initialized".
    const container = containerRef.current as any;
    if (container._leaflet_id) {
      delete container._leaflet_id;
    }

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom,
      scrollWheelZoom: false,
    });
    instanceRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const marker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
    markerRef.current = marker;

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      handleChange(pos.lat, pos.lng);
    });
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      handleChange(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      map.remove();
      instanceRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Mise à jour (lat/lng changent depuis l'extérieur — ex. recherche
  // d'adresse ou géolocalisation, sans faire bouger le marqueur au doigt) ───
  useEffect(() => {
    if (!instanceRef.current || !markerRef.current) return;
    const current = markerRef.current.getLatLng();
    // Évite de recentrer la carte pendant que l'utilisateur est justement
    // en train de glisser le marqueur (onChange vient alors d'ici même).
    if (Math.abs(current.lat - lat) < 1e-9 && Math.abs(current.lng - lng) < 1e-9) return;
    markerRef.current.setLatLng([lat, lng]);
    instanceRef.current.setView([lat, lng]);
  }, [lat, lng]);

  return <div ref={containerRef} style={{ height: '260px', width: '100%', borderRadius: '16px' }} />;
}
