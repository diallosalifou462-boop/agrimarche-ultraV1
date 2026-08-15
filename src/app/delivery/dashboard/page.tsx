'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp, getDoc, writeBatch, Timestamp
} from 'firebase/firestore';
import {
  MapPin, Phone, CheckCircle, User,
  Wifi, WifiOff, Package, ChevronDown, ChevronUp,
  AlertCircle, Eye, Target, LogOut, Navigation,
  Calendar, MessageCircle, Save, Zap,
  Wallet, X, TrendingUp, Award, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { ORDER_STATUS_CONFIG, statusTint, formatFCFA } from '@/lib/orderStatus';
import { apiUrl } from '@/lib/api-config';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Location { lat: number; lng: number }
interface Order {
  id: string;
  orderNumber?: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  status: string;
  customerLocation?: { address?: string; lat?: number; lng?: number };
  sellerId?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerLocation?: { address?: string; lat?: number; lng?: number };
  delivererId?: string;
  delivererName?: string;
  delivererPhone?: string;
  total?: number;
  // Frais de livraison = la part qui revient réellement au livreur pour
  // cette course (calculé au checkout, voir src/app/checkout/page.tsx).
  // C'est CE montant qu'il faut afficher/compter comme "gain du livreur" —
  // pas `total`/`totalAmount` qui est le prix payé par le client (produits
  // + livraison), un montant qui n'appartient pas au livreur.
  deliveryFee?: number;
  tracking?: {
    currentLocation?: Location;
    lastUpdate?: any;
    enabled?: boolean;
    speed?: number;
    accuracy?: number;
    // Parcours de suivi hybride — indépendant de `status` (voir claimOrder).
    phase?: 'assigned' | 'en_route' | 'approaching' | 'arrived';
  };
  items?: { name: string; qty: number; productName?: string; quantity?: number }[];
  totalAmount?: number;
  deliveredAt?: any;
  dateDepart?: string;
  dateArrivee?: string;
  dateRetour?: string;
  dateLivree?: string;
  dateProbleme?: string;
  noteProbleme?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nowLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function timeSinceMinutes(firebaseTs: any) {
  if (!firebaseTs?.toDate) return null;
  const ms = Date.now() - firebaseTs.toDate().getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? String(mins % 60).padStart(2, '0') : ''}`;
}

// ✅ NOUVEAU — distance à vol d'oiseau (formule de haversine) entre le
// livreur et une destination, utilisée pour l'affichage ET pour trier les
// commandes par proximité (les plus proches en premier).
function haversineKm(a: Location, b: Location): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
// Lien universel Google Maps (fonctionne en navigation web ET en ouvrant
// l'appli Google Maps si installée sur le téléphone du livreur).
function navigateUrl(dest: Location): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
}

// ✅ NOUVEAU — bip sonore court (Web Audio, aucun fichier externe requis)
// + vibration, joués quand une nouvelle commande disponible apparaît, pour
// que le livreur n'ait pas besoin de garder l'œil rivé sur l'écran.
function playNewOrderAlert() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.16);
      });
    }
  } catch { /* silencieux si le navigateur bloque l'audio autoplay */ }
  try { navigator.vibrate?.([120, 60, 120]); } catch { /* pas de vibration sur ce device */ }
}

// ─── Mini Map ─────────────────────────────────────────────────────────────────

function MiniMap({ deliveryLocation, destinationLocation, orderId }: {
  deliveryLocation?: Location;
  destinationLocation?: Location;
  orderId: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (!mapRef.current || mapInstanceRef.current) return;
      const L = (window as any).L;
      if (!L) return;
      const center = deliveryLocation || destinationLocation || { lat: 14.7167, lng: -17.4677 };
      const map = L.map(mapRef.current, {
        center: [center.lat, center.lng], zoom: 13,
        zoomControl: false, attributionControl: false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
      mapInstanceRef.current = map;

      if (deliveryLocation) {
        markerRef.current = L.marker([deliveryLocation.lat, deliveryLocation.lng], {
          icon: L.divIcon({ html: `<div style="width:32px;height:32px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:14px">📍</div>`, className: '', iconSize: [32, 32], iconAnchor: [16, 16] })
        }).addTo(map);
      }
      if (destinationLocation) {
        destMarkerRef.current = L.marker([destinationLocation.lat, destinationLocation.lng], {
          icon: L.divIcon({ html: `<div style="width:28px;height:28px;border-radius:50%;background:#f97316;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:12px">🏠</div>`, className: '', iconSize: [28, 28], iconAnchor: [14, 14] })
        }).addTo(map);
      }
      if (deliveryLocation && destinationLocation) {
        map.fitBounds(L.latLngBounds([deliveryLocation.lat, deliveryLocation.lng], [destinationLocation.lat, destinationLocation.lng]), { padding: [40, 40] });
      }
    };

    if ((window as any).L) initMap();
    else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    }
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstanceRef.current || !markerRef.current || !deliveryLocation) return;
    markerRef.current.setLatLng([deliveryLocation.lat, deliveryLocation.lng]);
  }, [deliveryLocation]);

  return <div ref={mapRef} style={{ width: '100%', height: '180px', borderRadius: '12px', overflow: 'hidden' }} />;
}

// ─── Timeline Badge ───────────────────────────────────────────────────────────

function TimelineBadge({ order }: { order: Order }) {
  const steps = [
    { key: 'dateDepart', label: 'Départ', color: '#3b82f6', icon: '🚀' },
    { key: 'dateArrivee', label: 'Arrivée', color: '#f97316', icon: '📍' },
    { key: 'dateLivree', label: 'Livrée', color: '#10b981', icon: '✅' },
    { key: 'dateRetour', label: 'Retour', color: '#8b5cf6', icon: '🔙' },
  ];

  const filled = steps.filter(s => order[s.key as keyof Order]);
  if (filled.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
      {steps.map((s, i) => {
        const val = order[s.key as keyof Order] as string | undefined;
        const done = !!val;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              padding: '3px 8px',
              borderRadius: '99px',
              background: done ? s.color + '18' : '#f1f5f9',
              border: `1px solid ${done ? s.color + '40' : '#e2e8f0'}`,
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <span style={{ fontSize: '10px' }}>{s.icon}</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: done ? s.color : '#94a3b8' }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: '12px', height: '1px', background: done ? '#e2e8f0' : '#e2e8f0' }} />
            )}
          </div>
        );
      })}
      {order.dateProbleme && (
        <div style={{ padding: '3px 8px', borderRadius: '99px', background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px' }}>⚠️</span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#ef4444' }}>Problème</span>
        </div>
      )}
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onMarkDelivered, onMarkArrived, currentLocation }: { order: Order; onMarkDelivered: (id: string) => void; onMarkArrived: (id: string) => void; currentLocation?: Location | null }) {
  const [expanded, setExpanded] = useState(false);
  const [showDates, setShowDates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dates, setDates] = useState({
    dateDepart: order.dateDepart || '',
    dateArrivee: order.dateArrivee || '',
    dateRetour: order.dateRetour || '',
    dateLivree: order.dateLivree || '',
    dateProbleme: order.dateProbleme || '',
    noteProbleme: order.noteProbleme || '',
  });

  // Sync when order updates from Firestore
  useEffect(() => {
    setDates({
      dateDepart: order.dateDepart || '',
      dateArrivee: order.dateArrivee || '',
      dateRetour: order.dateRetour || '',
      dateLivree: order.dateLivree || '',
      dateProbleme: order.dateProbleme || '',
      noteProbleme: order.noteProbleme || '',
    });
  }, [order.dateDepart, order.dateArrivee, order.dateRetour, order.dateLivree, order.dateProbleme, order.noteProbleme]);

  const lastUpdateStr = timeSinceMinutes(order.tracking?.lastUpdate);
  const dest = (order.customerLocation?.lat && order.customerLocation?.lng)
    ? { lat: order.customerLocation.lat, lng: order.customerLocation.lng } : undefined;
  const distanceKm = currentLocation && dest ? haversineKm(currentLocation, dest) : null;
  const items = order.items || [];

  const saveDates = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        dateDepart: dates.dateDepart || null,
        dateArrivee: dates.dateArrivee || null,
        dateRetour: dates.dateRetour || null,
        dateLivree: dates.dateLivree || null,
        dateProbleme: dates.dateProbleme || null,
        noteProbleme: dates.noteProbleme || null,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); setShowDates(false); }, 1200);
    } catch {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const dateFields = [
    { label: 'Départ', key: 'dateDepart', icon: '🚀', color: '#3b82f6' },
    { label: 'Arrivée', key: 'dateArrivee', icon: '📍', color: '#f97316' },
    { label: 'Livrée', key: 'dateLivree', icon: '✅', color: '#10b981' },
    { label: 'Retour', key: 'dateRetour', icon: '🔙', color: '#8b5cf6' },
    { label: 'Problème', key: 'dateProbleme', icon: '⚠️', color: '#ef4444' },
  ];

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '18px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#1e293b', letterSpacing: '-0.3px' }}>
                #{order.orderNumber || order.id.slice(-6).toUpperCase()}
              </span>
              <span style={{
                padding: '3px 9px', borderRadius: '99px', fontSize: '10px', fontWeight: 600,
                background: statusTint(order.status, 0.14), color: ORDER_STATUS_CONFIG[order.status as keyof typeof ORDER_STATUS_CONFIG]?.color ?? '#d97706',
              }}>
                {ORDER_STATUS_CONFIG[order.status as keyof typeof ORDER_STATUS_CONFIG]?.icon ?? ''} {ORDER_STATUS_CONFIG[order.status as keyof typeof ORDER_STATUS_CONFIG]?.label ?? order.status}
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', fontWeight: 500 }}>{order.userName}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {/* ✅ FIX : affichait `order.totalAmount` (champ quasi jamais
                rempli côté checkout, et de toute façon le prix CLIENT, pas
                le gain du livreur). On affiche maintenant `deliveryFee` —
                le montant qui sera comptabilisé dans le solde du livreur
                une fois le bouton "Livré" pressé. */}
            <p style={{ color: '#059669', fontWeight: 800, fontSize: '17px' }}>+{formatFCFA(order.deliveryFee ?? 0)}</p>
            {lastUpdateStr && (
              <p style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>MAJ {lastUpdateStr}</p>
            )}
          </div>
        </div>

        {/* Timeline */}
        <TimelineBadge order={order} />

        {/* Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
            <MapPin size={13} style={{ color: '#f97316', marginTop: '2px', flexShrink: 0 }} />
            <span style={{ color: '#334155', fontSize: '13px', lineHeight: 1.4, flex: 1 }}>
              {order.customerLocation?.address || 'Adresse non spécifiée'}
            </span>
            {distanceKm !== null && (
              <span style={{ flexShrink: 0, padding: '2px 8px', background: '#eff6ff', borderRadius: '99px', color: '#2563eb', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {formatDistance(distanceKm)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Phone size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />
            <span style={{ color: '#334155', fontSize: '13px' }}>{order.userPhone || 'Pas de téléphone'}</span>
          </div>
        </div>

        {/* ✅ Itinéraire GPS — bouton prioritaire, plein largeur : lance la
            navigation turn-by-turn dans Google Maps vers l'adresse client.
            C'était complètement absent avant (seulement une mini-carte
            statique) alors que c'est le besoin n°1 d'un livreur sur le terrain. */}
        {dest && (
          <a
            href={navigateUrl(dest)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%', padding: '13px', marginBottom: '10px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff',
              fontSize: '13px', fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
            }}
          >
            <Navigation size={15} /> Itinéraire GPS{distanceKm !== null ? ` · ${formatDistance(distanceKm)}` : ''}
          </a>
        )}

        {/* Map */}
        {(order.tracking?.currentLocation || dest) && (
          <div style={{ marginBottom: '14px' }}>
            <MiniMap deliveryLocation={order.tracking?.currentLocation} destinationLocation={dest} orderId={order.id} />
            <p style={{ color: '#94a3b8', fontSize: '10px', marginTop: '6px', textAlign: 'center' }}>📍 Livreur · 🏠 Client</p>
          </div>
        )}

        {/* Action row 1 — contact client */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '8px', marginBottom: '8px' }}>
          <a href={`tel:${order.userPhone}`} style={btnStyle('#f1f5f9', '#3b82f6')}>
            <Phone size={13} /> Appeler
          </a>
          <a href={`https://wa.me/${order.userPhone?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={btnStyle('#dcfce7', '#059669')}>
            💬 WhatsApp
          </a>
          <button onClick={() => onMarkDelivered(order.id)} style={btnStyleBtn('#10b981', '#fff')}>
            <CheckCircle size={13} /> Livré
          </button>
        </div>

        {/* Parcours de suivi hybride : seule étape que le livreur confirme
            manuellement entre l'attribution et la livraison — le GPS seul
            (précision de quelques dizaines de mètres) ne peut pas garantir
            de façon fiable "je suis devant la porte du client". */}
        {order.tracking?.phase && ['en_route', 'approaching'].includes(order.tracking.phase) && (
          <button
            onClick={() => onMarkArrived(order.id)}
            style={{ ...btnStyleBtn('#eff6ff', '#2563eb'), width: '100%', marginBottom: '8px' }}
          >
            📍 Marquer comme arrivé chez le client
          </button>
        )}

        {/* Action row 2 — dates + support */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button onClick={() => setShowDates(s => !s)} style={btnStyleBtn(showDates ? '#ede9fe' : '#f1f5f9', showDates ? '#7c3aed' : '#475569')}>
            <Calendar size={13} />
            {showDates ? 'Fermer' : 'Dates suivi'}
          </button>
          <a href="https://wa.me/221779747073" target="_blank" rel="noopener noreferrer" style={btnStyle('#fff7ed', '#ea580c')}>
            🆘 Support
          </a>
        </div>

        {/* Date fields panel */}
        {showDates && (
          <div style={{ marginTop: '14px', padding: '16px', background: '#faf5ff', borderRadius: '16px', border: '1px solid #e9d5ff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Calendar size={13} color="#7c3aed" />
              <p style={{ color: '#7c3aed', fontSize: '12px', fontWeight: 700 }}>SUIVI DE LIVRAISON</p>
            </div>

            {dateFields.map(({ label, key, icon, color }) => (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <p style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600 }}>
                    <span style={{ marginRight: '4px' }}>{icon}</span>{label}
                    {dates[key as keyof typeof dates] && (
                      <span style={{ marginLeft: '6px', color, fontWeight: 700 }}>
                        {formatDate(dates[key as keyof typeof dates] as string)}
                      </span>
                    )}
                  </p>
                  <button
                    onClick={() => setDates(d => ({ ...d, [key]: nowLocal() }))}
                    style={{ padding: '3px 8px', background: color + '18', border: `1px solid ${color}40`, borderRadius: '99px', color, fontSize: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    <Zap size={9} /> Maintenant
                  </button>
                </div>
                <input
                  type="datetime-local"
                  value={dates[key as keyof typeof dates] as string}
                  onChange={e => setDates(d => ({ ...d, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '9px 11px', border: `1px solid ${dates[key as keyof typeof dates] ? color + '60' : '#ddd6fe'}`, borderRadius: '10px', fontSize: '13px', color: '#1e293b', background: '#fff', outline: 'none' }}
                />
              </div>
            ))}

            <div>
              <p style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, marginBottom: '5px' }}>📝 Note problème</p>
              <textarea
                value={dates.noteProbleme}
                onChange={e => setDates(d => ({ ...d, noteProbleme: e.target.value }))}
                placeholder="Décrire le problème rencontré..."
                rows={3}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid #ddd6fe', borderRadius: '10px', fontSize: '13px', color: '#1e293b', background: '#fff', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
              />
            </div>

            <button
              onClick={saveDates}
              disabled={saving || saved}
              style={{ padding: '12px', background: saved ? '#10b981' : saving ? '#a78bfa' : '#7c3aed', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'background 0.2s' }}
            >
              {saved ? <><CheckCircle size={14} /> Enregistré !</> : saving ? 'Enregistrement...' : <><Save size={14} /> Enregistrer</>}
            </button>
          </div>
        )}
      </div>

      {/* Expand items */}
      {items.length > 0 && (
        <>
          <button onClick={() => setExpanded(e => !e)} style={{ width: '100%', padding: '11px 16px', background: '#f8fafc', border: 'none', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Package size={13} />
            {items.length} article(s)
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {expanded && (
            <div style={{ padding: '14px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: '#334155', fontSize: '13px', borderBottom: i < items.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                  <span>{item.name}</span>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>×{item.qty}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Shared button style helpers ──────────────────────────────────────────────

function btnStyle(bg: string, color: string): React.CSSProperties {
  return { padding: '11px 8px', background: bg, borderRadius: '12px', color, fontSize: '12px', fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' };
}
function btnStyleBtn(bg: string, color: string): React.CSSProperties {
  return { ...btnStyle(bg, color), border: 'none', cursor: 'pointer' };
}

// ─── Earnings Modal ────────────────────────────────────────────────────────────
// ✅ NOUVEAU — panneau "Mes gains" ouvert en tapant l'avatar en haut à droite.
// Répond au besoin : voir l'historique de ses livraisons ("affiliations",
// c'est-à-dire toutes les commandes rattachées à ce livreur) ainsi que le
// montant total gagné. Le gain de chaque commande = `deliveryFee` (les frais
// de livraison réellement encaissés par le livreur), jamais `total` (prix
// payé par le client, qui inclut les produits — ne lui appartient pas).

function EarningsModal({
  profile, totalEarnings, todayEarnings, weekEarnings, completedDeliveries, onClose,
}: {
  profile: any;
  totalEarnings: number;
  todayEarnings: number;
  weekEarnings: number;
  completedDeliveries: Order[];
  onClose: () => void;
}) {
  const history = [...completedDeliveries].sort((a, b) => {
    const ta = a.deliveredAt?.toDate?.()?.getTime?.() ?? 0;
    const tb = b.deliveredAt?.toDate?.()?.getTime?.() ?? 0;
    return tb - ta;
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '480px', maxHeight: '88vh', overflowY: 'auto',
          background: '#f8fafc', borderRadius: '28px 28px 0 0', padding: '20px 18px 28px',
          animation: 'slideUp 0.25s ease-out',
        }}
      >
        <style>{`@keyframes slideUp{from{transform:translateY(24px);opacity:0.6}to{transform:translateY(0);opacity:1}}`}</style>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={18} color="#fff" />
            </div>
            <div>
              <p style={{ color: '#1e293b', fontSize: '15px', fontWeight: 700 }}>{profile?.displayName || 'Livreur'}</p>
              <p style={{ color: '#94a3b8', fontSize: '11px' }}>{profile?.phone || ''}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} color="#475569" />
          </button>
        </div>

        {/* Solde total */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: '22px', padding: '22px', marginBottom: '14px', boxShadow: '0 8px 24px rgba(15,23,42,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
            <Wallet size={15} color="#10b981" />
            <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total gagné</p>
          </div>
          <p style={{ color: '#fff', fontSize: '32px', fontWeight: 800, letterSpacing: '-0.5px' }}>{formatFCFA(totalEarnings)}</p>
          <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>{completedDeliveries.length} livraison(s) validée(s)</p>
        </div>

        {/* Aujourd'hui / cette semaine */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
          <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
              <Clock size={12} color="#f97316" />
              <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 600 }}>Aujourd'hui</p>
            </div>
            <p style={{ color: '#1e293b', fontSize: '16px', fontWeight: 700 }}>{formatFCFA(todayEarnings)}</p>
          </div>
          <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
              <TrendingUp size={12} color="#3b82f6" />
              <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 600 }}>7 derniers jours</p>
            </div>
            <p style={{ color: '#1e293b', fontSize: '16px', fontWeight: 700 }}>{formatFCFA(weekEarnings)}</p>
          </div>
        </div>

        {/* Historique des livraisons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <Award size={13} color="#7c3aed" />
          <p style={{ color: '#334155', fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Historique des livraisons</p>
        </div>

        {history.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px 18px', textAlign: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>Aucune livraison validée pour le moment</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.map(o => (
              <div key={o.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ color: '#1e293b', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' }}>
                    #{o.orderNumber || o.id.slice(-6).toUpperCase()}
                  </p>
                  <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '1px' }}>
                    {o.userName || '—'}{o.deliveredAt?.toDate ? ` · ${formatDate(o.deliveredAt.toDate().toISOString())}` : ''}
                  </p>
                </div>
                <span style={{ padding: '4px 10px', background: '#ecfdf5', borderRadius: '99px', color: '#059669', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  +{formatFCFA(o.deliveryFee ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DeliveryDashboard() {
  const { user, profile, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'disponibles' | 'encours' | 'terminees'>('encours');
  const [autoTabSet, setAutoTabSet] = useState(false);
  const [showEarnings, setShowEarnings] = useState(false);
  const ordersRef = useRef<Order[]>([]);

  useEffect(() => { ordersRef.current = orders; }, [orders]);

  // Auth guard
  const routerRef = useRef(router);
  routerRef.current = router;
  useEffect(() => {
    if (authLoading) return;
    if (!user) { routerRef.current.push('/'); return; }
    if (profile === undefined || profile === null) return;
    if (profile.role !== 'delivery') routerRef.current.push('/');
  }, [authLoading, user, profile]);

  // Listen orders — actives + terminées du jour, POUR CE LIVREUR UNIQUEMENT.
  // ⚠️ Avant : la requête ne filtrait que sur `status`, sans `delivererId`.
  // Firestore ne peut pas prouver qu'un tel résultat respecte la règle
  // (qui exige delivererId == request.auth.uid) à partir du seul `where`
  // sur status — la requête entière échouait en permission-denied pour un
  // vrai compte livreur, et aurait sinon montré les livraisons de TOUS les
  // livreurs à chacun. Nécessite un index composite (delivererId, status) —
  // Firebase le proposera automatiquement au premier lancement.
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'orders'),
      where('delivererId', '==', user.uid),
      where('status', 'in', ['en_livraison', 'livre'])
    );
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as Order))); // FIX: id apres le spread (voir checkout/page.tsx)
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Listen commandes disponibles : une fois CONFIRMÉES par le vendeur
  // (en_preparation), pas encore prises par un livreur.
  // ⚠️ FIX MAJEUR : cette requête ciblait auparavant 'en_attente' — un
  // statut où le VENDEUR N'A MÊME PAS ENCORE CONFIRMÉ la commande (il
  // pourrait encore la refuser). Un livreur pouvait donc s'engager sur une
  // commande qui n'existait pas encore vraiment côté préparation. Combiné
  // au bug de claimOrder ci-dessous (qui ne touchait jamais `status`),
  // c'est ce qui faisait "disparaître" les commandes acceptées : elles
  // quittaient "disponibles" (delivererId posé) sans jamais apparaître
  // dans "en cours" (qui exige status en_livraison/livre).
  // ⚠️ RISQUE OPÉRATIONNEL NON RÉSOLU : ce fichier ne contient aucune
  // firestore.rules — je n'ai pas pu vérifier ni corriger les règles de
  // sécurité. Si une règle restreint explicitement la lecture des
  // commandes par un livreur au statut 'en_attente' (comme le suggérait
  // l'ancien commentaire ci-dessous), ce changement de requête renverra
  // silencieusement ZÉRO résultat (permission denied, pas une erreur
  // visible) tant que la règle n'est pas mise à jour côté Firebase Console
  // pour autoriser 'en_preparation' à la place.
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const prevAvailableCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('status', '==', 'en_preparation'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as Order)) // FIX: id apres le spread
        .filter(o => !o.delivererId);
      setAvailableOrders(list);
      // ✅ NOUVEAU : bip + vibration dès qu'une nouvelle commande disponible
      // apparaît, pour ne pas dépendre du livreur qui regarde son écran en
      // permanence. Le premier chargement (prevAvailableCountRef.current
      // === null) ne déclenche jamais l'alerte — seulement les arrivées
      // après coup.
      if (prevAvailableCountRef.current !== null && list.length > prevAvailableCountRef.current) {
        playNewOrderAlert();
      }
      prevAvailableCountRef.current = list.length;
    });
    return () => unsub();
  }, [user]);

  const claimOrder = async (orderId: string) => {
    if (!user || !profile) return;
    setClaimingId(orderId);
    try {
      // ⚠️ FIX cohérence inter-collections (même bug que admin/page.tsx::
      // updateOrderStatus avant son fix, et admin/assign-delivery avant le
      // sien) : cette fonction n'écrivait QUE dans 'orders'. seller_orders
      // — lu par le vendeur pour voir qui vient récupérer sa commande —
      // ne recevait jamais delivererId/Name/Phone. Un vendeur regardant
      // sa commande "en_attente" ne voyait jamais qu'un livreur l'avait
      // déjà prise en charge, et pouvait par exemple la refuser alors
      // qu'un livreur était déjà en route pour la récupérer.
      const payload = {
        delivererId: user.uid,
        delivererName: profile.displayName || 'Livreur',
        delivererPhone: profile.phone || '',
        delivererAssignedAt: Timestamp.now(),
        // ⚠️ FIX MAJEUR — le vrai bug signalé ("accepter ne fait rien, la
        // commande disparaît") : cette fonction ne touchait auparavant QUE
        // delivererId, jamais `status`. Résultat : la commande quittait
        // "disponibles" (delivererId désormais posé, filtré côté client)
        // sans jamais apparaître dans "en cours" (qui exige status
        // en_livraison/livre) — orpheline, invisible partout, tant que
        // personne d'autre ne retouchait la commande. Puisque cette
        // fonction ne cible désormais que des commandes déjà confirmées
        // par le vendeur (en_preparation, voir la requête juste au-dessus),
        // faire passer status → en_livraison au moment de l'acceptation
        // est sémantiquement correct : le livreur prend en charge
        // maintenant, pas "un jour peut-être".
        status: 'en_livraison' as const,
        // Parcours de suivi hybride : ce champ pilote désormais les
        // notifications de progression (voir notifyDeliveryPhaseChange côté
        // serveur), indépendamment de `status`.
        'tracking.phase': 'assigned',
      };
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', orderId), payload, { merge: true });
      const sellerOrderSnap = await getDoc(doc(db, 'seller_orders', orderId));
      if (sellerOrderSnap.exists()) {
        batch.set(doc(db, 'seller_orders', orderId), payload, { merge: true });
      }
      await batch.commit();

      // ⚠️ CONSOLIDATION : cette notification vendeur partait auparavant
      // d'ici, côté client. Elle est désormais gérée par le trigger serveur
      // notifyDelivererClaimed (functions/src/index.ts), qui réagit à
      // l'apparition de delivererId sur cette même écriture — garanti,
      // même si l'app du livreur se ferme juste après ce clic.
    } catch {
      alert("Cette commande vient peut-être d'être prise par un autre livreur.");
    } finally {
      setClaimingId(null);
    }
  };

  // GPS
  const startSharingLocation = useCallback(async () => {
    try {
      const permission = await Geolocation.requestPermissions();
      if (permission.location !== 'granted') {
        setLocationError('Accès à la position refusé. Activez la géolocalisation.');
        return;
      }
    } catch { /* web fallback */ }

    setSharingLocation(true);
    setLocationError(null);

    const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 10000 }, async (pos, err) => {
      if (err || !pos) { setLocationError('Erreur de géolocalisation'); setSharingLocation(false); return; }
      const { latitude, longitude, accuracy } = pos.coords;
      setCurrentLocation({ lat: latitude, lng: longitude });
      setGpsAccuracy(accuracy ?? null);
      const activeOrders = ordersRef.current.filter(o => o.status === 'en_livraison');
      await Promise.all(activeOrders.map(order => {
        const payload: Record<string, any> = {
          'tracking.currentLocation': { lat: latitude, lng: longitude },
          'tracking.lastUpdate': serverTimestamp(),
          'tracking.enabled': true,
          'tracking.accuracy': accuracy,
        };
        // Premier point GPS reçu pour cette commande → passage automatique
        // en 'en_route'. On ne touche PAS à la phase si elle est déjà plus
        // avancée (le geofencing serveur peut déjà l'avoir mise à
        // 'approaching', voire 'arrived' si le livreur a confirmé
        // manuellement) — sinon un point GPS en retard pourrait faire
        // régresser l'affichage côté acheteur.
        if (!order.tracking?.phase || order.tracking.phase === 'assigned') {
          payload['tracking.phase'] = 'en_route';
        }
        return updateDoc(doc(db, 'orders', order.id), payload).catch(console.error);
      }));
    });
    setWatchId(id);
  }, []);

  const stopSharingLocation = useCallback(async () => {
    if (watchId !== null) await Geolocation.clearWatch({ id: watchId });
    setWatchId(null);
    setSharingLocation(false);
    setLocationError(null);
    const activeOrders = ordersRef.current.filter(o => o.status === 'en_livraison');
    await Promise.all(activeOrders.map(order =>
      updateDoc(doc(db, 'orders', order.id), { 'tracking.enabled': false }).catch(console.error)
    ));
  }, [watchId]);

  const markAsArrived = async (orderId: string) => {
    try {
      const payload = { 'tracking.phase': 'arrived' as const };
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', orderId), payload, { merge: true });
      const sellerOrderSnap = await getDoc(doc(db, 'seller_orders', orderId));
      if (sellerOrderSnap.exists()) {
        batch.set(doc(db, 'seller_orders', orderId), payload, { merge: true });
      }
      await batch.commit();
      // Notification côté serveur (notifyDeliveryPhaseChange, sur la
      // transition de tracking.phase) — rien à envoyer manuellement ici.
    } catch { toast.error("Erreur lors de la confirmation d'arrivée"); }
  };

  const markAsDelivered = async (orderId: string) => {
    if (!confirm('Confirmer la livraison ?')) return;
    // Le montant du gain (deliveryFee) est capturé AVANT l'updateDoc pour
    // l'afficher dans le toast de confirmation — il vient s'ajouter au
    // "montant" total du livreur (visible dans le panneau Mes gains, calculé
    // dynamiquement à partir de toutes les commandes status:'livre').
    const order = ordersRef.current.find(o => o.id === orderId);
    try {
      // ⚠️ FIX cohérence inter-collections — LE bug le plus impactant de
      // toute la chaîne de livraison : c'est ICI, quand le livreur confirme
      // réellement la livraison sur le terrain, que le statut passe à
      // 'livre' en production (pas depuis l'admin, qui ne sert qu'aux
      // interventions manuelles). Cette fonction n'écrivait QUE dans
      // 'orders' — jamais dans 'seller_orders', que "Mon compte" (acheteur)
      // lit pour son historique. Concrètement : après une vraie livraison
      // confirmée par le livreur, l'acheteur restait bloqué sur l'ancien
      // statut ("En livraison") indéfiniment dans son compte.
      const now = Timestamp.now();
      const payload = {
        status: 'livre' as const, statusLabel: 'Livrée',
        deliveredAt: now, updatedAt: now, 'tracking.enabled': false,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', orderId), payload, { merge: true });
      const sellerOrderSnap = await getDoc(doc(db, 'seller_orders', orderId));
      if (sellerOrderSnap.exists()) {
        batch.set(doc(db, 'seller_orders', orderId), payload, { merge: true });
      }
      await batch.commit();
      toast.success(
        order?.deliveryFee
          ? `Livraison confirmée ! +${formatFCFA(order.deliveryFee)} ajoutés à votre solde`
          : 'Livraison confirmée !'
      );

      // ⚠️ CONSOLIDATION : les notifications push acheteur et vendeur sur
      // livraison confirmée partaient auparavant d'ici, côté client.
      // Le trigger serveur notifyOrderStatusStep (functions/src/index.ts)
      // couvre désormais les deux — message acheteur enrichi (invitation à
      // noter + lien /review) et bloc vendeur ajouté — déclenché
      // automatiquement par l'écriture ci-dessus, garanti même si l'app du
      // livreur se ferme juste après la confirmation.

      // SMS de confirmation de livraison au client (best-effort, via
      // Infobip — voir /api/send-sms). Ne bloque jamais la validation.
      if (order?.userPhone) {
        fetch(apiUrl('/api/send-sms'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: order.userPhone,
            message: `AgriMarché : votre commande #${order.orderNumber || orderId.slice(-6).toUpperCase()} vient d'être livrée. Bon appétit !`,
          }),
        }).catch((e) => console.warn('[delivery] SMS confirmation non envoyé:', e));
      }
    } catch { toast.error('Erreur lors de la validation'); }
  };

  const handleLogout = async () => {
    if (sharingLocation) await stopSharingLocation();
    await logout();
    router.push('/auth/login');
  };

  // ✅ NOUVEAU : une fois les données chargées, on ouvre automatiquement
  // l'onglet le plus utile — "En cours" s'il y en a, sinon "Disponibles"
  // s'il y en a, sinon "Terminées". Une seule fois (autoTabSet), pour ne
  // jamais reprendre la main sur un choix manuel du livreur ensuite.
  useEffect(() => {
    if (autoTabSet || loading) return;
    const hasActive = orders.some(o => o.status === 'en_livraison');
    const hasAvailable = availableOrders.length > 0;
    if (hasActive) setActiveTab('encours');
    else if (hasAvailable) setActiveTab('disponibles');
    else setActiveTab('terminees');
    setAutoTabSet(true);
  }, [loading, orders, availableOrders, autoTabSet]);

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <div style={{ width: '44px', height: '44px', border: '3px solid #e2e8f0', borderTop: '3px solid #10b981', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#94a3b8', fontSize: '13px' }}>Chargement...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!user || profile?.role !== 'delivery') return null;

  const activeDeliveries = orders.filter(o => o.status === 'en_livraison');
  const completedDeliveries = orders.filter(o => o.status === 'livre');

  // ✅ NOUVEAU : commandes livrées aujourd'hui — statistique la plus
  // parlante pour un livreur en fin de journée (avant : aucun résumé
  // n'existait, il fallait compter à la main dans "Terminées").
  const todayStr = new Date().toDateString();
  const deliveredTodayCount = completedDeliveries.filter(o => {
    const ts = o.deliveredAt?.toDate?.();
    return ts && ts.toDateString() === todayStr;
  }).length;

  // ✅ NOUVEAU : montant total gagné par le livreur — somme des `deliveryFee`
  // (frais de livraison, PAS le prix des produits) de toutes ses commandes
  // marquées "livre". Recalculé en direct depuis Firestore à chaque rendu :
  // pas de compteur séparé à faire dériver, donc jamais désynchronisé.
  const totalEarnings = completedDeliveries.reduce((sum, o) => sum + (o.deliveryFee ?? 0), 0);
  const todayEarnings = completedDeliveries
    .filter(o => { const ts = o.deliveredAt?.toDate?.(); return ts && ts.toDateString() === todayStr; })
    .reduce((sum, o) => sum + (o.deliveryFee ?? 0), 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekEarnings = completedDeliveries
    .filter(o => { const ts = o.deliveredAt?.toDate?.(); return ts && ts.getTime() >= weekAgo; })
    .reduce((sum, o) => sum + (o.deliveryFee ?? 0), 0);

  // ✅ NOUVEAU : tri par proximité — les commandes les plus proches du
  // livreur (position GPS actuelle) apparaissent en premier, dans les deux
  // listes. Sans position GPS active, l'ordre reste celui de Firestore.
  const sortedAvailable = currentLocation
    ? [...availableOrders].sort((a, b) => {
        const da = (a.sellerLocation?.lat && a.sellerLocation?.lng) ? haversineKm(currentLocation, { lat: a.sellerLocation.lat, lng: a.sellerLocation.lng }) : Infinity;
        const db_ = (b.sellerLocation?.lat && b.sellerLocation?.lng) ? haversineKm(currentLocation, { lat: b.sellerLocation.lat, lng: b.sellerLocation.lng }) : Infinity;
        return da - db_;
      })
    : availableOrders;
  const sortedActive = currentLocation
    ? [...activeDeliveries].sort((a, b) => {
        const da = (a.customerLocation?.lat && a.customerLocation?.lng) ? haversineKm(currentLocation, { lat: a.customerLocation.lat, lng: a.customerLocation.lng }) : Infinity;
        const db_ = (b.customerLocation?.lat && b.customerLocation?.lng) ? haversineKm(currentLocation, { lat: b.customerLocation.lat, lng: b.customerLocation.lng }) : Infinity;
        return da - db_;
      })
    : activeDeliveries;

  const tabs = [
    { key: 'disponibles' as const, label: 'Disponibles', count: sortedAvailable.length },
    { key: 'encours'     as const, label: 'En cours',     count: sortedActive.length },
    { key: 'terminees'   as const, label: 'Terminées',    count: completedDeliveries.length },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 2px; }`}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px 18px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div>
              <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Bonjour</p>
              <h1 style={{ color: '#fff', fontSize: '19px', fontWeight: 700, marginTop: '1px' }}>{profile?.displayName || 'Livreur'}</h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* ✅ NOUVEAU : avatar cliquable → ouvre "Mes gains" (historique
                  des livraisons + montant total encaissé). Avant, cette icône
                  était purement décorative. */}
              <button
                onClick={() => setShowEarnings(true)}
                style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Mes gains"
              >
                <User size={17} color="#fff" />
              </button>
              <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 13px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '40px', color: '#fca5a5', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                <LogOut size={13} />
              </button>
            </div>
          </div>

          {/* ✅ NOUVEAU : solde total, cliquable, toujours visible en haut —
              répond au besoin de voir "le montant" du livreur d'un coup
              d'œil, sans devoir ouvrir le panneau détaillé. */}
          <button
            onClick={() => setShowEarnings(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)',
              borderRadius: '14px', padding: '11px 14px', marginBottom: '12px', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wallet size={15} color="#34d399" />
              <span style={{ color: '#a7f3d0', fontSize: '12px', fontWeight: 600 }}>Mon solde</span>
            </div>
            <span style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>{formatFCFA(totalEarnings)}</span>
          </button>

          {/* ✅ NOUVEAU : bilan du jour — la stat la plus attendue par un
              livreur en fin/cours de journée, absente avant. */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '10px 14px' }}>
              <p style={{ color: '#10b981', fontSize: '20px', fontWeight: 800, lineHeight: 1 }}>{deliveredTodayCount}</p>
              <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 600, marginTop: '3px' }}>Livrées aujourd'hui</p>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '10px 14px' }}>
              <p style={{ color: '#f97316', fontSize: '20px', fontWeight: 800, lineHeight: 1 }}>{sortedActive.length}</p>
              <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 600, marginTop: '3px' }}>En cours</p>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '10px 14px' }}>
              <p style={{ color: '#3b82f6', fontSize: '20px', fontWeight: 800, lineHeight: 1 }}>{sortedAvailable.length}</p>
              <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 600, marginTop: '3px' }}>Disponibles</p>
            </div>
          </div>

          {/* ✅ NOUVEAU : onglets — remplace le long défilement vertical qui
              obligeait à scroller pour retrouver les commandes terminées. */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  flex: 1, padding: '10px 6px', background: 'transparent', border: 'none',
                  borderBottom: activeTab === t.key ? '2px solid #10b981' : '2px solid transparent',
                  color: activeTab === t.key ? '#fff' : '#94a3b8',
                  fontSize: '12px', fontWeight: activeTab === t.key ? 700 : 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  transition: 'color 0.15s',
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span style={{
                    padding: '1px 6px', borderRadius: '99px', fontSize: '10px', fontWeight: 700,
                    background: activeTab === t.key ? '#10b981' : 'rgba(255,255,255,0.1)',
                    color: activeTab === t.key ? '#04140d' : '#cbd5e1',
                  }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* GPS Panel */}
        <div style={{ background: '#ffffff', border: sharingLocation ? '1px solid #10b981' : '1px solid #e2e8f0', borderRadius: '20px', padding: '18px', boxShadow: sharingLocation ? '0 4px 16px rgba(16,185,129,0.12)' : 'none', transition: 'all 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: sharingLocation ? '#ecfdf5' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {sharingLocation ? <Wifi size={19} color="#10b981" /> : <WifiOff size={19} color="#94a3b8" />}
              </div>
              <div>
                <p style={{ color: '#1e293b', fontSize: '14px', fontWeight: 600 }}>Position GPS</p>
                <p style={{ color: sharingLocation ? '#10b981' : '#94a3b8', fontSize: '11px' }}>
                  {sharingLocation ? 'Visible par les clients' : 'Non partagée'}
                </p>
              </div>
            </div>
            <button onClick={sharingLocation ? stopSharingLocation : startSharingLocation} style={{ padding: '7px 16px', background: sharingLocation ? '#fee2e2' : '#10b981', border: 'none', borderRadius: '40px', color: sharingLocation ? '#ef4444' : '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              {sharingLocation ? 'Arrêter' : 'Activer'}
            </button>
          </div>

          {sharingLocation && currentLocation && (
            <div style={{ marginTop: '12px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Target size={13} color="#10b981" />
                <span style={{ color: '#475569', fontSize: '12px' }}>Position</span>
                {gpsAccuracy && <span style={{ color: '#94a3b8', fontSize: '10px' }}>±{Math.round(gpsAccuracy)}m</span>}
              </div>
              <span style={{ color: '#1e293b', fontSize: '11px', fontFamily: 'monospace' }}>
                {currentLocation.lat.toFixed(5)}°, {currentLocation.lng.toFixed(5)}°
              </span>
            </div>
          )}

          {sharingLocation && (
            <div style={{ marginTop: '10px', padding: '9px 12px', background: '#ecfdf5', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Eye size={13} color="#10b981" />
              <p style={{ color: '#065f46', fontSize: '11px' }}>Les clients voient votre position en temps réel</p>
            </div>
          )}

          {locationError && (
            <div style={{ marginTop: '10px', padding: '9px 12px', background: '#fef2f2', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <AlertCircle size={13} color="#ef4444" />
              <p style={{ color: '#ef4444', fontSize: '11px' }}>{locationError}</p>
            </div>
          )}
        </div>

        {/* Contenu de l'onglet actif */}
        {activeTab === 'disponibles' && (
          sortedAvailable.length === 0 ? (
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '48px 24px', textAlign: 'center' }}>
              <Zap size={44} color="#cbd5e1" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#475569', fontWeight: 500, fontSize: '16px', marginBottom: '4px' }}>Aucune commande disponible</p>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>Une alerte sonore te préviendra dès qu'une nouvelle commande arrive</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sortedAvailable.map(order => {
                const pickup = (order.sellerLocation?.lat && order.sellerLocation?.lng)
                  ? { lat: order.sellerLocation.lat, lng: order.sellerLocation.lng } : undefined;
                const pickupDistanceKm = currentLocation && pickup ? haversineKm(currentLocation, pickup) : null;
                return (
                <div key={order.id} style={{ background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: '16px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ color: '#1e293b', fontSize: '14px', fontWeight: 600, fontFamily: 'monospace' }}>
                        #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                      </p>
                      <p style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                        Vendeur : {order.sellerName || '—'} {order.sellerPhone ? `· ${order.sellerPhone}` : ''}
                      </p>
                      {(order.sellerLocation?.address || order.customerLocation?.address) && (
                        <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={11} /> {order.sellerLocation?.address || order.customerLocation?.address}
                          {pickupDistanceKm !== null && <span style={{ color: '#2563eb', fontWeight: 700 }}>· {formatDistance(pickupDistanceKm)}</span>}
                        </p>
                      )}
                    </div>
                    {/* ✅ FIX : c'était `order.total` (prix payé par le CLIENT,
                        produits + livraison) affiché ici — trompeur pour un
                        livreur qui doit voir CE QU'IL GAGNE, c'est-à-dire
                        `deliveryFee` uniquement. */}
                    <span style={{ padding: '4px 10px', background: '#dcfce7', borderRadius: '99px', color: '#059669', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      Gain {formatFCFA(order.deliveryFee ?? 0)}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: pickup ? '1fr 1fr' : '1fr', gap: '8px' }}>
                    {pickup && (
                      <a href={navigateUrl(pickup)} target="_blank" rel="noopener noreferrer" style={btnStyle('#eff6ff', '#2563eb')}>
                        <Navigation size={13} /> Y aller
                      </a>
                    )}
                    <button
                      onClick={() => claimOrder(order.id)}
                      disabled={claimingId === order.id}
                      style={{ padding: '10px', background: claimingId === order.id ? '#93c5fd' : '#3b82f6', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: claimingId === order.id ? 'default' : 'pointer' }}
                    >
                      {claimingId === order.id ? 'Assignation…' : 'Je livre cette commande'}
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )
        )}

        {activeTab === 'encours' && (
          sortedActive.length === 0 ? (
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '48px 24px', textAlign: 'center' }}>
              <Package size={44} color="#cbd5e1" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#475569', fontWeight: 500, fontSize: '16px', marginBottom: '4px' }}>Aucune livraison en cours</p>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>Prends une commande dans l'onglet « Disponibles »</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {sortedActive.map(order => (
                <OrderCard key={order.id} order={order} onMarkDelivered={markAsDelivered} onMarkArrived={markAsArrived} currentLocation={currentLocation} />
              ))}
            </div>
          )
        )}

        {activeTab === 'terminees' && (
          completedDeliveries.length === 0 ? (
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '48px 24px', textAlign: 'center' }}>
              <CheckCircle size={44} color="#cbd5e1" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#475569', fontWeight: 500, fontSize: '16px', marginBottom: '4px' }}>Aucune livraison terminée</p>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>Tes livraisons validées apparaîtront ici</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {completedDeliveries.map(order => (
                <div key={order.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '13px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ color: '#1e293b', fontSize: '14px', fontWeight: 600, fontFamily: 'monospace' }}>
                      #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                    </p>
                    <p style={{ color: '#64748b', fontSize: '12px' }}>{order.userName}</p>
                    {/* Mini timeline for completed */}
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {order.dateDepart && <span style={{ fontSize: '10px', color: '#3b82f6' }}>🚀 {formatDate(order.dateDepart)}</span>}
                      {order.dateLivree && <span style={{ fontSize: '10px', color: '#10b981' }}>✅ {formatDate(order.dateLivree)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span style={{ padding: '4px 12px', background: statusTint('livre', 0.12), borderRadius: '99px', color: ORDER_STATUS_CONFIG.livre.color, fontSize: '11px', fontWeight: 600 }}>
                      {ORDER_STATUS_CONFIG.livre.icon} {ORDER_STATUS_CONFIG.livre.label}
                    </span>
                    {/* ✅ NOUVEAU : gain comptabilisé pour cette livraison,
                        visible directement dans l'onglet "Terminées". */}
                    <span style={{ color: '#059669', fontSize: '12px', fontWeight: 700 }}>
                      +{formatFCFA(order.deliveryFee ?? 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        <div style={{ height: '16px' }} />
      </div>

      {showEarnings && (
        <EarningsModal
          profile={profile}
          totalEarnings={totalEarnings}
          todayEarnings={todayEarnings}
          weekEarnings={weekEarnings}
          completedDeliveries={completedDeliveries}
          onClose={() => setShowEarnings(false)}
        />
      )}
    </div>
  );
}

