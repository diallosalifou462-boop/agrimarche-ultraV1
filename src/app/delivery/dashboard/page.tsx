'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import {
  Navigation, MapPin, Phone, CheckCircle,
  Truck, Clock, User, Wifi, WifiOff,
  Package, ChevronDown, ChevronUp, AlertCircle,
  Eye, Target, Route, LogOut
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
}

// ─── Mini Map Component ──────────────────────────────────────────────────────

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
        center: [center.lat, center.lng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      if (deliveryLocation) {
        const deliveryIcon = L.divIcon({
          html: `<div style="
            width:32px;height:32px;border-radius:50%;
            background:#10b981;
            border:3px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,0.15);
            display:flex;align-items:center;justify-content:center;
            font-size:14px;
          ">📍</div>`,
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        markerRef.current = L.marker([deliveryLocation.lat, deliveryLocation.lng], { icon: deliveryIcon }).addTo(map);
      }

      if (destinationLocation) {
        const destIcon = L.divIcon({
          html: `<div style="
            width:28px;height:28px;border-radius:50%;
            background:#f97316;
            border:3px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,0.15);
            display:flex;align-items:center;justify-content:center;
            font-size:12px;
          ">🏠</div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        destMarkerRef.current = L.marker([destinationLocation.lat, destinationLocation.lng], { icon: destIcon }).addTo(map);
      }

      if (deliveryLocation && destinationLocation) {
        const bounds = L.latLngBounds(
          [deliveryLocation.lat, deliveryLocation.lng],
          [destinationLocation.lat, destinationLocation.lng]
        );
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    };

    if ((window as any).L) {
      initMap();
    } else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstanceRef.current) return;
    if (deliveryLocation && markerRef.current) {
      markerRef.current.setLatLng([deliveryLocation.lat, deliveryLocation.lng]);
    }
  }, [deliveryLocation]);

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '180px', borderRadius: '12px', overflow: 'hidden' }}
    />
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onMarkDelivered }: { order: Order; onMarkDelivered: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const lastUpdate = order.tracking?.lastUpdate?.toDate?.();
  const timeSince = lastUpdate
    ? Math.round((Date.now() - lastUpdate.getTime()) / 60)
    : null;

  const dest = (order.customerLocation?.lat && order.customerLocation?.lng)
    ? { lat: order.customerLocation.lat, lng: order.customerLocation.lng }
    : undefined;

  // ✅ CORRECTION: Vérifier que items existe
  const items = order.items || [];
  const itemsCount = items.length;

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '20px',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      <div style={{ padding: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'monospace',
                fontSize: '16px',
                fontWeight: 700,
                color: '#1e293b',
                letterSpacing: '-0.3px',
              }}>
                #{order.orderNumber || order.id.slice(-6).toUpperCase()}
              </span>
              <span style={{
                padding: '4px 10px',
                background: '#fef3c7',
                borderRadius: '99px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#d97706',
              }}>
                En livraison
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '13px', marginTop: '6px' }}>{order.userName}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {order.totalAmount && (
              <p style={{ color: '#10b981', fontWeight: 700, fontSize: '18px' }}>
                {order.totalAmount.toLocaleString()} FCFA
              </p>
            )}
            {timeSince !== null && (
              <p style={{ color: '#94a3b8', fontSize: '10px' }}>
                Dernière MAJ il y a {timeSince} min
              </p>
            )}
          </div>
        </div>

        {/* Info Row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <MapPin size={14} style={{ color: '#f97316', marginTop: '2px', flexShrink: 0 }} />
            <span style={{ color: '#334155', fontSize: '13px', lineHeight: 1.4 }}>
              {order.customerLocation?.address || 'Adresse non spécifiée'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Phone size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
            <span style={{ color: '#334155', fontSize: '13px' }}>
              {order.userPhone || 'Pas de téléphone'}
            </span>
          </div>
        </div>

        {/* Map */}
        {(order.tracking?.currentLocation || dest) && (
          <div style={{ marginBottom: '16px' }}>
            <MiniMap
              deliveryLocation={order.tracking?.currentLocation}
              destinationLocation={dest}
              orderId={order.id}
            />
            <p style={{ color: '#94a3b8', fontSize: '10px', marginTop: '8px', textAlign: 'center' }}>
              📍 Livreur · 🏠 Client
            </p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '10px' }}>
          <a
            href={`tel:${order.userPhone}`}
            style={{
              padding: '12px',
              background: '#f1f5f9',
              borderRadius: '12px',
              color: '#3b82f6',
              fontSize: '12px',
              fontWeight: 600,
              textAlign: 'center',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Phone size={14} /> Appeler
          </a>
          <a
            href={`https://wa.me/${order.userPhone?.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '12px',
              background: '#dcfce7',
              borderRadius: '12px',
              color: '#059669',
              fontSize: '12px',
              fontWeight: 600,
              textAlign: 'center',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            💬 WhatsApp
          </a>
          <button
            onClick={() => onMarkDelivered(order.id)}
            style={{
              padding: '12px',
              background: '#10b981',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle size={14} /> Livré
          </button>
        </div>
      </div>

      {/* Expand items - ✅ CORRECTION: utilise items.length au lieu de order.items?.length */}
      {itemsCount > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#f8fafc',
              border: 'none',
              borderTop: '1px solid #e2e8f0',
              color: '#64748b',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Package size={14} />
            {itemsCount} article(s)
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expanded && (
            <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              {items.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '6px 0',
                  color: '#334155',
                  fontSize: '13px',
                  borderBottom: i < items.length - 1 ? '1px solid #e2e8f0' : 'none',
                }}>
                  <span>{item.name}</span>
                  <span style={{ color: '#64748b' }}>×{item.qty}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
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
  const [watchId, setWatchId] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const ordersRef = useRef<Order[]>([]);

  useEffect(() => { ordersRef.current = orders; }, [orders]);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'delivery')) router.push('/');
  }, [authLoading, user, profile, router]);

  // Listen orders
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('status', '==', 'expediee'));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // GPS sharing
  const startSharingLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Géolocalisation non supportée');
      return;
    }
    setSharingLocation(true);
    setLocationError(null);

    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setCurrentLocation({ lat: latitude, lng: longitude });
        setGpsAccuracy(accuracy);

        const activeOrders = ordersRef.current.filter(o => o.status === 'expediee');
        await Promise.all(activeOrders.map(order =>
          updateDoc(doc(db, 'orders', order.id), {
            'tracking.currentLocation': { lat: latitude, lng: longitude },
            'tracking.lastUpdate': serverTimestamp(),
            'tracking.enabled': true,
            'tracking.accuracy': accuracy,
          }).catch(console.error)
        ));
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: 'Accès à la position refusé. Activez la géolocalisation.',
          2: 'Position indisponible. Vérifiez votre GPS.',
          3: 'Délai dépassé. Réessayez.',
        };
        setLocationError(msgs[err.code] || 'Erreur de géolocalisation');
        setSharingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    setWatchId(id);
  }, [user]);

  const stopSharingLocation = useCallback(async () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    setWatchId(null);
    setSharingLocation(false);
    setLocationError(null);

    const activeOrders = ordersRef.current.filter(o => o.status === 'expediee');
    await Promise.all(activeOrders.map(order =>
      updateDoc(doc(db, 'orders', order.id), { 'tracking.enabled': false }).catch(console.error)
    ));
  }, [watchId]);

  const markAsDelivered = async (orderId: string) => {
    if (!confirm('Confirmer la livraison ?')) return;
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'livree',
        statusLabel: 'Livrée',
        deliveredAt: serverTimestamp(),
        'tracking.enabled': false,
      });
      alert('✅ Commande marquée comme livrée');
    } catch {
      alert('Erreur lors de la validation');
    }
  };

  const handleLogout = async () => {
    if (sharingLocation) {
      await stopSharingLocation();
    }
    await logout();
    router.push('/auth/login');
  };

  if (authLoading || loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '48px', height: '48px',
          border: '3px solid #e2e8f0',
          borderTop: '3px solid #10b981',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!user || profile?.role !== 'delivery') return null;

  const activeDeliveries = orders.filter(o => o.status === 'expediee');
  const completedDeliveries = orders.filter(o => o.status === 'livree');

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #e2e8f0; }
        ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ color: '#1e293b', fontSize: '20px', fontWeight: 700 }}>
                Livraisons
              </h1>
              <p style={{ color: '#10b981', fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>
                {activeDeliveries.length} livraison(s) en cours
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <User size={18} color="#64748b" />
              </div>
              <button
                onClick={handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: '40px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
              >
                <LogOut size={14} />
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* GPS Panel */}
        <div style={{
          background: '#ffffff',
          border: sharingLocation ? '1px solid #10b981' : '1px solid #e2e8f0',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: sharingLocation ? '0 4px 12px rgba(16,185,129,0.1)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: sharingLocation ? '#ecfdf5' : '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {sharingLocation ? <Wifi size={20} color="#10b981" /> : <WifiOff size={20} color="#94a3b8" />}
              </div>
              <div>
                <p style={{ color: '#1e293b', fontSize: '15px', fontWeight: 600 }}>Partage de position</p>
                <p style={{ color: sharingLocation ? '#10b981' : '#94a3b8', fontSize: '12px' }}>
                  {sharingLocation ? 'Visible par les clients' : 'Position non partagée'}
                </p>
              </div>
            </div>
            <button
              onClick={sharingLocation ? stopSharingLocation : startSharingLocation}
              style={{
                padding: '8px 18px',
                background: sharingLocation ? '#fee2e2' : '#10b981',
                border: 'none',
                borderRadius: '40px',
                color: sharingLocation ? '#ef4444' : '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {sharingLocation ? 'Arrêter' : 'Activer'}
            </button>
          </div>

          {sharingLocation && currentLocation && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: '#f8fafc',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Target size={14} color="#10b981" />
                <span style={{ color: '#475569', fontSize: '12px' }}>Position actuelle</span>
              </div>
              <span style={{ color: '#1e293b', fontSize: '12px', fontFamily: 'monospace' }}>
                {currentLocation.lat.toFixed(5)}°, {currentLocation.lng.toFixed(5)}°
              </span>
            </div>
          )}

          {sharingLocation && (
            <div style={{ marginTop: '12px', padding: '10px 12px', background: '#ecfdf5', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={14} color="#10b981" />
              <p style={{ color: '#065f46', fontSize: '11px' }}>
                Les clients peuvent voir votre position sur la carte
              </p>
            </div>
          )}

          {locationError && (
            <div style={{ marginTop: '12px', padding: '10px 12px', background: '#fef2f2', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} color="#ef4444" />
              <p style={{ color: '#ef4444', fontSize: '11px' }}>{locationError}</p>
            </div>
          )}
        </div>

        {/* Active Deliveries */}
        {activeDeliveries.length === 0 && completedDeliveries.length === 0 ? (
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '20px',
            padding: '48px 24px',
            textAlign: 'center',
          }}>
            <Package size={48} color="#cbd5e1" style={{ marginBottom: '12px' }} />
            <p style={{ color: '#475569', fontWeight: 500, fontSize: '16px', marginBottom: '4px' }}>Aucune livraison</p>
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>Les commandes expédiées apparaîtront ici</p>
          </div>
        ) : (
          <>
            {activeDeliveries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={14} color="#f97316" />
                  <p style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>EN COURS</p>
                </div>
                {activeDeliveries.map(order => (
                  <OrderCard key={order.id} order={order} onMarkDelivered={markAsDelivered} />
                ))}
              </div>
            )}

            {completedDeliveries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={14} color="#10b981" />
                  <p style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>TERMINÉES</p>
                </div>
                {completedDeliveries.map(order => (
                  <div key={order.id} style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ color: '#1e293b', fontSize: '14px', fontWeight: 600, fontFamily: 'monospace' }}>
                        #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                      </p>
                      <p style={{ color: '#64748b', fontSize: '12px' }}>{order.userName}</p>
                    </div>
                    <span style={{
                      padding: '4px 12px',
                      background: '#ecfdf5',
                      borderRadius: '99px',
                      color: '#059669',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}>
                      Livrée
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ height: '20px' }} />
      </div>
    </div>
  );
}