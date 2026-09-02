'use client';

import dynamic from 'next/dynamic';
import type { FleetPoint } from './FleetMapInner';

// Chargement dynamique — Leaflet dépend de `window`, incompatible avec le
// rendu serveur de Next.js (même contrainte que MapInner/LocationPicker).
const FleetMapInner = dynamic(() => import('./FleetMapInner'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 420, width: '100%', borderRadius: 16, background: '#12141a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ width: 28, height: 28, border: '2px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: 13, color: '#6b7280' }}>Chargement de la carte…</span>
    </div>
  ),
});

export type { FleetPoint, FleetPointKind } from './FleetMapInner';

interface FleetMapProps {
  points: FleetPoint[];
  fallbackCenter?: { lat: number; lng: number };
  height?: number;
  selectedId?: string | null;
}

export default function FleetMap(props: FleetMapProps) {
  return <FleetMapInner {...props} />;
}
