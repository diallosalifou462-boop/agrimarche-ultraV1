'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import {
  MapPin, Phone, CheckCircle, Clock, User,
  Wifi, WifiOff, Package, ChevronDown, ChevronUp,
  AlertCircle, Eye, Target, LogOut, Navigation,
  Calendar, MessageCircle, Save, Zap
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Location { lat: number; lng: number }
interface Order {
  id: string;
  orderNumber?: string;
  userName?: string;
  userPhone?: string;
  status: string;
  customerLocation?: { address?: string; lat?: number; lng?: number };
  tracking?: {
    currentLocation?: Location;
    lastUpdate?: any;
    enabled?: boolean;
    speed?: number;
    accuracy?: number;
  };
  items?: { name: string; qty: number }[];
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

function OrderCard({ order, onMarkDelivered }: { order: Order; onMarkDelivered: (id: string) => void }) {
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
              <span style={{ padding: '3px 9px', background: '#fef3c7', borderRadius: '99px', fontSize: '10px', fontWeight: 600, color: '#d97706' }}>
                En livraison
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', fontWeight: 500 }}>{order.userName}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {order.totalAmount && (
              <p style={{ color: '#10b981', fontWeight: 700, fontSize: '17px' }}>{order.totalAmount.toLocaleString()} FCFA</p>
            )}
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
            <span style={{ color: '#334155', fontSize: '13px', lineHeight: 1.4 }}>
              {order.customerLocation?.address || 'Adresse non spécifiée'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Phone size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />
            <span style={{ color: '#334155', fontSize: '13px' }}>{order.userPhone || 'Pas de téléphone'}</span>
          </div>
        </div>

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

  // Listen orders — actives + terminées du jour
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('status', 'in', ['en_livraison', 'livre']));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

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
      await Promise.all(activeOrders.map(order =>
        updateDoc(doc(db, 'orders', order.id), {
          'tracking.currentLocation': { lat: latitude, lng: longitude },
          'tracking.lastUpdate': serverTimestamp(),
          'tracking.enabled': true,
          'tracking.accuracy': accuracy,
        }).catch(console.error)
      ));
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

  const markAsDelivered = async (orderId: string) => {
    if (!confirm('Confirmer la livraison ?')) return;
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'livre', statusLabel: 'Livrée',
        deliveredAt: serverTimestamp(), 'tracking.enabled': false,
      });
    } catch { alert('Erreur lors de la validation'); }
  };

  const handleLogout = async () => {
    if (sharingLocation) await stopSharingLocation();
    await logout();
    router.push('/auth/login');
  };

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

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 2px; }`}</style>

      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ color: '#1e293b', fontSize: '19px', fontWeight: 700 }}>Livraisons</h1>
              <p style={{ color: '#10b981', fontSize: '12px', fontWeight: 500, marginTop: '1px' }}>
                {activeDeliveries.length} en cours · {completedDeliveries.length} terminée(s)
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={16} color="#64748b" />
              </div>
              <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 13px', background: '#ef4444', border: 'none', borderRadius: '40px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                <LogOut size={13} /> Déconnexion
              </button>
            </div>
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

        {/* Empty state */}
        {activeDeliveries.length === 0 && completedDeliveries.length === 0 ? (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '48px 24px', textAlign: 'center' }}>
            <Package size={44} color="#cbd5e1" style={{ marginBottom: '12px' }} />
            <p style={{ color: '#475569', fontWeight: 500, fontSize: '16px', marginBottom: '4px' }}>Aucune livraison</p>
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>Les commandes expédiées apparaîtront ici</p>
          </div>
        ) : (
          <>
            {activeDeliveries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Clock size={13} color="#f97316" />
                  <p style={{ color: '#64748b', fontSize: '11px', fontWeight: 700 }}>EN COURS ({activeDeliveries.length})</p>
                </div>
                {activeDeliveries.map(order => (
                  <OrderCard key={order.id} order={order} onMarkDelivered={markAsDelivered} />
                ))}
              </div>
            )}

            {completedDeliveries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <CheckCircle size={13} color="#10b981" />
                  <p style={{ color: '#64748b', fontSize: '11px', fontWeight: 700 }}>TERMINÉES ({completedDeliveries.length})</p>
                </div>
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
                    <span style={{ padding: '4px 12px', background: '#ecfdf5', borderRadius: '99px', color: '#059669', fontSize: '11px', fontWeight: 600 }}>Livrée</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ height: '16px' }} />
      </div>
    </div>
  );
}

