'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Carte multi-marqueurs partagée par l'admin (« tous les utilisateurs ») et
 * le livreur (« vendeurs prêts + clients à livrer »). Contrairement à
 * MapInner (un seul trajet départ→arrivée), ce composant affiche un nombre
 * arbitraire de points, chacun typé/coloré, avec centrage + zoom
 * automatiques sur l'ensemble des points visibles.
 */

export type FleetPointKind = 'client' | 'seller' | 'delivery' | 'admin' | 'pickup' | 'dropoff' | 'me';

export interface FleetPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  kind: FleetPointKind;
  /** Position approximative (floutée pour la confidentialité) — affichée différemment. */
  approximate?: boolean;
  onClick?: () => void;
}

const KIND_COLOR: Record<FleetPointKind, string> = {
  client: '#10b981',   // vert — client à livrer
  seller: '#f97316',   // orange — vendeur / point de retrait prêt
  delivery: '#6366f1', // indigo — livreur
  admin: '#8b5cf6',    // violet — admin
  pickup: '#f97316',
  dropoff: '#10b981',
  me: '#06b6d4',        // cyan — ma position
};

const KIND_EMOJI: Record<FleetPointKind, string> = {
  client: '🏠',
  seller: '🏪',
  delivery: '🛵',
  admin: '🛡️',
  pickup: '🏪',
  dropoff: '🏠',
  me: '📍',
};

function makeDivIcon(kind: FleetPointKind, approximate?: boolean) {
  const color = KIND_COLOR[kind];
  const emoji = KIND_EMOJI[kind];
  return L.divIcon({
    className: 'fleet-map-marker',
    html: `<div style="
        width:30px;height:30px;border-radius:50%;
        background:${color};
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,.35);
        border:2px solid #fff;
        font-size:14px;
        ${approximate ? 'opacity:.72;' : ''}
      ">${emoji}</div>
      ${approximate ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:2px dashed ${color};opacity:.5;"></div>` : ''}`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

/** Recentre/zoome automatiquement pour englober tous les points. */
function FitBounds({ points }: { points: FleetPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

interface FleetMapInnerProps {
  points: FleetPoint[];
  /** Point central par défaut si aucun point valide (ex. Dakar). */
  fallbackCenter?: { lat: number; lng: number };
  height?: number;
  selectedId?: string | null;
}

export default function FleetMapInner({ points, fallbackCenter, height = 420, selectedId }: FleetMapInnerProps) {
  const valid = useMemo(
    () => points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180),
    [points]
  );
  const center = valid[0] ?? fallbackCenter ?? { lat: 14.7167, lng: -17.4677 }; // Dakar par défaut
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  useEffect(() => {
    if (selectedId && markerRefs.current[selectedId]) {
      markerRefs.current[selectedId]?.openPopup();
    }
  }, [selectedId]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={12}
      style={{ height, width: '100%', borderRadius: 16 }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds points={valid} />
      {valid.map(p => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={makeDivIcon(p.kind, p.approximate)}
          ref={el => { markerRefs.current[p.id] = el; }}
          eventHandlers={p.onClick ? { click: p.onClick } : undefined}
        >
          <Popup>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
            {p.sublabel && <div style={{ fontSize: 11, color: '#6b7280' }}>{p.sublabel}</div>}
            {p.approximate && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>📍 Position approximative</div>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
