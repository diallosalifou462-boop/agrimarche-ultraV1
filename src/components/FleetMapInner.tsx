'use client';

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

/**
 * Carte multi-marqueurs partagée par l'admin (« tous les utilisateurs ») et
 * le livreur (« vendeurs prêts + clients à livrer »). Contrairement à
 * MapInner (un seul trajet départ→arrivée), ce composant affiche un nombre
 * arbitraire de points, chacun typé/coloré, avec centrage + zoom
 * automatiques sur l'ensemble des points visibles.
 *
 * Clustering (leaflet.markercluster) : sans lui, une carte avec quelques
 * centaines de vendeurs devient illisible (marqueurs empilés) et lente
 * (chaque marqueur est un nœud DOM séparé). Les points se regroupent
 * visuellement en dessous d'un rayon de proximité à l'écran et se séparent
 * automatiquement au zoom — comportement standard sur ce type de carte
 * (cf. Uber, Yango).
 *
 * 🐛 CORRECTIF — "Map container is already initialized"
 *
 * Cette erreur venait de <MapContainer> (react-leaflet) + <MarkerClusterGroup>
 * (react-leaflet-cluster) : en dev, avec Fast Refresh/Turbopack (et le
 * double-appel d'effets de React Strict Mode), le composant peut être
 * ré-exécuté sur le MÊME nœud DOM sans que le nettoyage interne de
 * react-leaflet ait fini avant la nouvelle tentative — Leaflet pose un flag
 * `_leaflet_id` sur le conteneur et refuse catégoriquement un second
 * `L.map()` dessus tant qu'il y est.
 *
 * Plutôt que de dépendre du timing de nettoyage interne de react-leaflet
 * (hors de notre contrôle), ce composant gère Leaflet et le clustering en
 * impératif, avec un garde explicite — exactement le même principe déjà
 * appliqué à LocationPickerInner.tsx et TrackingMap (app/tracking/page.tsx).
 * `react-leaflet-cluster` n'est donc plus nécessaire pour ce fichier (mais
 * ne casse rien s'il reste dans package.json, un autre composant pourrait
 * l'utiliser).
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
  /**
   * Horodatage de la dernière position connue (Date, ms epoch, ou objet
   * Firestore Timestamp via `.toDate()`). Permet de distinguer un point
   * "en direct" d'un point figé depuis longtemps — sans ça, un livreur
   * dont la position date de 3 jours apparaît visuellement identique à un
   * livreur suivi en direct, ce qui est trompeur sur une carte flotte.
   */
  updatedAt?: Date | number | string | { toDate: () => Date } | null;
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

type Freshness = 'live' | 'recent' | 'stale' | 'unknown';

function toDate(v: FleetPoint['updatedAt']): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return null;
}

function getFreshness(v: FleetPoint['updatedAt']): Freshness {
  const d = toDate(v);
  if (!d) return 'unknown';
  const ageMs = Date.now() - d.getTime();
  if (ageMs < 60_000) return 'live';        // < 1 min : considéré en direct
  if (ageMs < 15 * 60_000) return 'recent'; // < 15 min : récent mais pas live
  return 'stale';                            // au-delà : clairement périmé
}

/** "il y a 3 min", "il y a 2 h", etc. — pour le popup. */
export function formatRelativeAge(v: FleetPoint['updatedAt']): string | null {
  const d = toDate(v);
  if (!d) return null;
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 10) return "à l'instant";
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  return `il y a ${days} j`;
}

function makeDivIcon(kind: FleetPointKind, approximate?: boolean, freshness?: Freshness) {
  const color = KIND_COLOR[kind];
  const emoji = KIND_EMOJI[kind];
  // Un point "live" pulse doucement et reste net ; un point périmé se
  // ternit progressivement — signal visuel immédiat de fiabilité, sans
  // avoir à lire le popup pour chaque marqueur.
  const staleOpacity = freshness === 'live' ? 1 : freshness === 'recent' ? 0.85 : freshness === 'stale' ? 0.55 : 0.3;
  const finalOpacity = approximate ? Math.min(staleOpacity, 0.72) : staleOpacity;
  const pulse = freshness === 'live'
    ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${color};opacity:.6;animation:fleetPulse 1.6s ease-out infinite;"></div>`
    : '';
  return L.divIcon({
    className: 'fleet-map-marker',
    html: `<div style="position:relative;">
      ${pulse}
      <div style="
        width:30px;height:30px;border-radius:50%;
        background:${color};
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,.35);
        border:2px solid #fff;
        font-size:14px;
        opacity:${finalOpacity};
      ">${emoji}</div>
      ${approximate ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:2px dashed ${color};opacity:.5;"></div>` : ''}
      </div>
      <style>@keyframes fleetPulse{0%{transform:scale(.8);opacity:.7}100%{transform:scale(1.6);opacity:0}}</style>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

/** Icône de cluster (groupe de N points) — cohérente visuellement avec les marqueurs individuels. */
function makeClusterIcon(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 50 ? 40 : 48;
  return L.divIcon({
    className: 'fleet-map-cluster',
    html: `<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:#16a34a;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 10px rgba(0,0,0,.4);
        border:3px solid #fff;
        color:#fff;font-weight:700;font-size:${count < 100 ? 14 : 12}px;
      ">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function popupHtml(p: FleetPoint): string {
  const fresh = getFreshness(p.updatedAt);
  return `
    <div style="font-size:13px;font-weight:600;">${escapeHtml(p.label)}</div>
    ${p.sublabel ? `<div style="font-size:11px;color:#6b7280;">${escapeHtml(p.sublabel)}</div>` : ''}
    ${p.approximate ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px;">📍 Position approximative</div>` : ''}
    ${p.updatedAt != null ? `<div style="font-size:10px;margin-top:2px;color:${fresh === 'live' ? '#16a34a' : fresh === 'recent' ? '#d97706' : '#9ca3af'};font-weight:${fresh === 'live' ? 700 : 400};">${fresh === 'live' ? '🟢 En direct' : `🕓 ${formatRelativeAge(p.updatedAt) ?? ''}`}</div>` : ''}
  `;
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

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<any>(null);
  const markerRefs = useRef<Record<string, L.Marker>>({});

  // ─── Création (une seule fois) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Filet de sécurité Fast Refresh (voir commentaire d'en-tête) : un
    // conteneur déjà marqué par un précédent montage non nettoyé est purgé
    // avant de laisser Leaflet y créer une nouvelle carte, au lieu de
    // planter avec "Map container is already initialized".
    const container = containerRef.current as any;
    if (container._leaflet_id) {
      delete container._leaflet_id;
    }

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 12,
      scrollWheelZoom: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const cluster = (L as any).markerClusterGroup({
      chunkedLoading: true,
      iconCreateFunction: makeClusterIcon,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    cluster.addTo(map);
    clusterRef.current = cluster;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markerRefs.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Marqueurs — reconstruits à chaque changement de `points` ──────────
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;

    cluster.clearLayers();
    const nextRefs: Record<string, L.Marker> = {};

    valid.forEach(p => {
      const marker = L.marker([p.lat, p.lng], { icon: makeDivIcon(p.kind, p.approximate, getFreshness(p.updatedAt)) });
      marker.bindPopup(popupHtml(p));
      if (p.onClick) marker.on('click', p.onClick);
      cluster.addLayer(marker);
      nextRefs[p.id] = marker;
    });
    markerRefs.current = nextRefs;

    // Recentrage/zoom automatique pour englober tous les points — même
    // logique que l'ancien composant FitBounds.
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 14);
    } else if (valid.length > 1) {
      const bounds = L.latLngBounds(valid.map(p => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [valid]);

  // ─── selectedId → ouvre le popup correspondant ─────────────────────────
  useEffect(() => {
    if (selectedId && markerRefs.current[selectedId]) {
      markerRefs.current[selectedId].openPopup();
    }
  }, [selectedId, valid]);

  return <div ref={containerRef} style={{ height, width: '100%', borderRadius: 16 }} />;
}
