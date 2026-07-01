'use client';

import dynamic from 'next/dynamic';

// Chargement dynamique pour éviter les erreurs SSR
const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full bg-gray-100 rounded-2xl flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-400 ml-2">Chargement de la carte...</span>
    </div>
  ),
});

interface DeliveryMapProps {
  pickupLocation: { lat: number; lng: number; address: string };
  deliveryLocation: { lat: number; lng: number; address: string };
}

export default function DeliveryMap({ pickupLocation, deliveryLocation }: DeliveryMapProps) {
  return <MapInner pickupLocation={pickupLocation} deliveryLocation={deliveryLocation} />;
}
