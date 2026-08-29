'use client';

import { useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
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

// Marqueur draggable : le vendeur peut le déplacer pour corriger une
// position GPS imprécise (point 4 de la spec géolocalisation), et un clic
// ailleurs sur la carte déplace aussi le marqueur — plus rapide au doigt
// sur mobile que de viser précisément le petit marqueur.
function DraggableMarker({ lat, lng, onChange }: Omit<LocationPickerInnerProps, 'zoom'>) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });

  const eventHandlers = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        onChange(pos.lat, pos.lng);
      },
    }),
    [onChange]
  );

  return <Marker position={[lat, lng]} icon={pinIcon} draggable eventHandlers={eventHandlers} />;
}

export default function LocationPickerInner({ lat, lng, onChange, zoom = 15 }: LocationPickerInnerProps) {
  const handleChange = useCallback((newLat: number, newLng: number) => onChange(newLat, newLng), [onChange]);

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      style={{ height: '260px', width: '100%', borderRadius: '16px' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <DraggableMarker lat={lat} lng={lng} onChange={handleChange} />
    </MapContainer>
  );
}
