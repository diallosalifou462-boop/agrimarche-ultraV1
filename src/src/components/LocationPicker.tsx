'use client';

import dynamic from 'next/dynamic';

// Chargement dynamique — Leaflet dépend de `window`, incompatible avec le
// rendu serveur de Next.js (même contrainte que MapInner/DeliveryMap).
const LocationPickerInner = dynamic(() => import('./LocationPickerInner'), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] w-full bg-gray-100 rounded-2xl flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-400 ml-2">Chargement de la carte...</span>
    </div>
  ),
});

interface LocationPickerProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  zoom?: number;
}

/**
 * Carte avec marqueur déplaçable, pour laisser le vendeur corriger une
 * position GPS imprécise (glisser le pin) ou choisir manuellement où se
 * trouve son exploitation/boutique. Un clic ailleurs sur la carte déplace
 * aussi le marqueur.
 */
export default function LocationPicker(props: LocationPickerProps) {
  return <LocationPickerInner {...props} />;
}
