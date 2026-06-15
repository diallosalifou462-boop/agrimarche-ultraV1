'use client';

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Icône personnalisée pour le départ (verte)
const pickupIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Icône personnalisée pour l'arrivée (rouge - même icône)
const deliveryIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface MapInnerProps {
  pickupLocation: {
    lat: number;
    lng: number;
    address: string;
  };
  deliveryLocation: {
    lat: number;
    lng: number;
    address: string;
  };
}

export default function MapInner({ pickupLocation, deliveryLocation }: MapInnerProps) {
  const [route, setRoute] = useState<[number, number][]>([]);
  const [distance, setDistance] = useState<string>('');
  const [duration, setDuration] = useState<string>('');

  const center: [number, number] = [
    (pickupLocation.lat + deliveryLocation.lat) / 2,
    (pickupLocation.lng + deliveryLocation.lng) / 2,
  ];

  useEffect(() => {
    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${pickupLocation.lng},${pickupLocation.lat};${deliveryLocation.lng},${deliveryLocation.lat}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes?.[0]) {
          const coords = data.routes[0].geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
          setRoute(coords);
          
          const distKm = data.routes[0].distance / 1000;
          setDistance(distKm.toFixed(1));
          
          const durationMin = data.routes[0].duration / 60;
          if (durationMin < 60) {
            setDuration(`${Math.round(durationMin)} min`);
          } else {
            const hours = Math.floor(durationMin / 60);
            const mins = Math.round(durationMin % 60);
            setDuration(`${hours}h ${mins}min`);
          }
        }
      } catch (error) {
        console.error('Erreur calcul itinéraire:', error);
      }
    };
    
    if (pickupLocation && deliveryLocation) {
      fetchRoute();
    }
  }, [pickupLocation, deliveryLocation]);

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: '300px', width: '100%', borderRadius: '12px' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={pickupIcon}>
          <Popup>
            <div className="text-sm font-medium">🏪 Départ</div>
            <div className="text-xs text-gray-600">{pickupLocation.address}</div>
          </Popup>
        </Marker>
        
        <Marker position={[deliveryLocation.lat, deliveryLocation.lng]} icon={deliveryIcon}>
          <Popup>
            <div className="text-sm font-medium">🏠 Livraison</div>
            <div className="text-xs text-gray-600">{deliveryLocation.address}</div>
          </Popup>
        </Marker>
        
        {route.length > 0 && (
          <Polyline
            positions={route}
            color="#10b981"
            weight={4}
            opacity={0.8}
            dashArray="10, 10"
          />
        )}
      </MapContainer>
      
      {distance && duration && (
        <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs shadow-md">
          <span className="font-semibold text-emerald-600">📍 {distance} km</span>
          <span className="mx-1 text-gray-400">•</span>
          <span className="text-gray-600">⏱️ {duration}</span>
        </div>
      )}
    </div>
  );
}