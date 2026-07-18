'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Location { lat: number; lng: number }
interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  userPhone?: string;
  customerLocation?: { address?: string; lat?: number; lng?: number };
  tracking?: {
    currentLocation?: Location;
    lastUpdate?: any;
    enabled?: boolean;
    speed?: number;
  };
  items?: { name: string; qty: number; price?: number }[];
  totalAmount?: number;
}

// ─── Haversine ─────────────────────────────────────────────────────────────────
function distanceKm(a: Location, b: Location): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ─── Map ───────────────────────────────────────────────────────────────────────
function TrackingMap({
  driverLoc,
  destLoc,
  animFrame,
}: {
  driverLoc?: Location;
  destLoc?: Location;
  animFrame: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const routeRef = useRef<any>(null);

  useEffect(() => {
    if (!document.getElementById('lf-css')) {
      const l = document.createElement('link');
      l.id = 'lf-css';
      l.rel = 'stylesheet';
      l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(l);
    }

    const init = () => {
      if (!mapRef.current || instanceRef.current) return;
      const L = (window as any).L;
      if (!L) return;

      const center = driverLoc || destLoc || { lat: 48.8566, lng: 2.3522 };
      const map = L.map(mapRef.current, {
        center: [center.lat, center.lng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 19 }
      ).addTo(map);

      instanceRef.current = map;

      // Marqueur livreur — point vert pulsé, sans emoji
      if (driverLoc) {
        const icon = L.divIcon({
          html: `
            <div style="position:relative;width:56px;height:56px">
              <div style="position:absolute;inset:0;border-radius:50%;
                background:rgba(34,197,94,0.15);
                animation:wave 1.8s ease-out infinite"></div>
              <div style="position:absolute;inset:10px;border-radius:50%;
                background:rgba(34,197,94,0.2);
                animation:wave 1.8s ease-out 0.5s infinite"></div>
              <div style="position:absolute;inset:18px;border-radius:50%;
                background:linear-gradient(135deg,#22c55e,#16a34a);
                border:2px solid #fff;
                box-shadow:0 0 20px rgba(34,197,94,0.6)"></div>
            </div>
            <style>
              @keyframes wave{0%{transform:scale(0.7);opacity:0.9}100%{transform:scale(2.2);opacity:0}}
            </style>
          `,
          className: '',
          iconSize: [56, 56],
          iconAnchor: [28, 28],
        });
        driverMarkerRef.current = L.marker(
          [driverLoc.lat, driverLoc.lng],
          { icon }
        ).addTo(map);
      }

      // Marqueur destination — point blanc
      if (destLoc) {
        const destIcon = L.divIcon({
          html: `
            <div style="
              width:38px;height:38px;border-radius:50%;
              background:#fff;
              border:3px solid #22c55e;
              box-shadow:0 0 18px rgba(34,197,94,0.5)">
            </div>
          `,
          className: '',
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });
        L.marker([destLoc.lat, destLoc.lng], { icon: destIcon })
          .addTo(map)
          .bindPopup('<b>Votre adresse</b>');
      }

      // Ligne pointillée verte
      if (driverLoc && destLoc) {
        routeRef.current = L.polyline(
          [[driverLoc.lat, driverLoc.lng], [destLoc.lat, destLoc.lng]],
          { color: '#22c55e', weight: 2, dashArray: '6,10', opacity: 0.7 }
        ).addTo(map);

        const bounds = L.latLngBounds(
          [driverLoc.lat, driverLoc.lng],
          [destLoc.lat, destLoc.lng]
        );
        map.fitBounds(bounds, { padding: [70, 70] });
      }
    };

    if ((window as any).L) init();
    else {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = init;
      document.head.appendChild(s);
    }

    return () => {
      if (instanceRef.current) {
        instanceRef.current.remove();
        instanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!(window as any).L || !instanceRef.current || !driverLoc) return;
    if (driverMarkerRef.current)
      driverMarkerRef.current.setLatLng([driverLoc.lat, driverLoc.lng]);
    if (routeRef.current && destLoc)
      routeRef.current.setLatLngs([
        [driverLoc.lat, driverLoc.lng],
        [destLoc.lat, destLoc.lng],
      ]);
  }, [animFrame]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}

// ─── Stepper ───────────────────────────────────────────────────────────────────
const STEPS = [
  { key: 'confirmee',      label: 'Confirmée'    },
  { key: 'en_preparation', label: 'Préparation'  },
  { key: 'en_livraison',       label: 'En route'     },
  { key: 'livre',         label: 'Livrée'       },
];

function Stepper({ status }: { status: string }) {
  const idx = STEPS.findIndex(s => s.key === status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      {STEPS.map((step, i) => {
        const done   = i <= idx;
        const active = i === idx;
        return (
          <div
            key={step.key}
            style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              {/* Cercle */}
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%',
                background: active
                  ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                  : done
                  ? 'rgba(34,197,94,0.15)'
                  : 'rgba(255,255,255,0.04)',
                border: active
                  ? '2px solid rgba(34,197,94,0.5)'
                  : done
                  ? '1.5px solid rgba(34,197,94,0.3)'
                  : '1.5px solid rgba(255,255,255,0.08)',
                boxShadow: active ? '0 0 14px rgba(34,197,94,0.4)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.4s ease',
                flexShrink: 0,
              }}>
                {done
                  ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7l3.5 3.5 5.5-6" stroke={active ? '#fff' : '#22c55e'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  : <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
                }
              </div>
              {/* Label */}
              <span style={{
                fontSize: '9px',
                fontWeight: active ? 700 : 500,
                color: active ? '#22c55e' : done ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.18)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                textAlign: 'center',
                maxWidth: '54px',
                lineHeight: 1.3,
              }}>{step.label}</span>
            </div>

            {/* Ligne */}
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: '1px',
                margin: '0 4px', marginBottom: '22px',
                background: i < idx
                  ? 'linear-gradient(90deg,rgba(34,197,94,0.5),rgba(34,197,94,0.2))'
                  : 'rgba(255,255,255,0.06)',
                transition: 'all 0.5s ease',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────
function TrackingClientContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') as string;

  const [order,     setOrder]     = useState<Order | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [showItems, setShowItems] = useState(false);
  const [tick,      setTick]      = useState(0);
  const [animFrame, setAnimFrame] = useState(0);

  // Ticker 1 s
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Écoute Firestore
  useEffect(() => {
    if (!orderId) return;
    const unsub = onSnapshot(doc(db, 'orders', orderId), snap => {
      if (snap.exists()) setOrder({ id: snap.id, ...snap.data() } as Order);
      setLoading(false);
    });
    return () => unsub();
  }, [orderId]);

  // Refresh animFrame à chaque mise à jour tracking
  useEffect(() => {
    setAnimFrame(n => n + 1);
  }, [order?.tracking?.currentLocation?.lat, order?.tracking?.currentLocation?.lng]);

  // ── Loading ──
  if (authLoading || loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#080810',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '16px',
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
          @keyframes spin{to{transform:rotate(360deg)}}
        `}</style>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          border: '2px solid rgba(34,197,94,0.2)',
          borderTopColor: '#22c55e',
          animation: 'spin 0.9s linear infinite',
        }} />
        <p style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Outfit, system-ui', fontSize: '13px' }}>
          Localisation en cours…
        </p>
      </div>
    );
  }

  // ── Not found ──
  if (!order) {
    return (
      <div style={{
        minHeight: '100vh', background: '#080810',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Outfit, system-ui', fontSize: '14px' }}>
          Commande introuvable
        </p>
      </div>
    );
  }

  // ── Data dérivée ──
  const driverLoc = order.tracking?.currentLocation;
  const destLoc: Location | undefined =
    order.customerLocation?.lat && order.customerLocation?.lng
      ? { lat: order.customerLocation.lat, lng: order.customerLocation.lng }
      : undefined;

  const distance    = driverLoc && destLoc ? distanceKm(driverLoc, destLoc) : null;
  const speed       = order.tracking?.speed ?? 0;
  const eta         = distance
    ? speed > 0.5
      ? Math.max(1, Math.round((distance / (speed / 3.6)) / 60))
      : Math.max(1, Math.round(distance * 3.5))
    : null;

  const lastUpdate  = order.tracking?.lastUpdate?.toDate?.() as Date | undefined;
  const secAgo      = lastUpdate
    ? Math.round((Date.now() - lastUpdate.getTime()) / 1000) + tick
    : null;
  const isLive      = secAgo !== null && secAgo < 30;
  const isDelivered = order.status === 'livre';

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: '#080810',
      fontFamily: "'Outfit', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      maxWidth: '430px', margin: '0 auto',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{display:none}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(34,197,94,0.2)}50%{box-shadow:0 0 36px rgba(34,197,94,0.45)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.25}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .row-item:hover{background:rgba(255,255,255,0.04)!important;border-radius:10px}
      `}</style>

      {/* ══ MAP ══ */}
      <div style={{ position: 'relative', height: '52vh', flexShrink: 0 }}>

        {driverLoc || destLoc ? (
          <TrackingMap driverLoc={driverLoc} destLoc={destLoc} animFrame={animFrame} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg,#0a0a14,#0d1a0d)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '12px',
          }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              border: '2px solid rgba(34,197,94,0.2)',
              borderTopColor: '#22c55e',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px' }}>
              En attente de la position…
            </p>
          </div>
        )}

        {/* Dégradé bas */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '100px',
          background: 'linear-gradient(to top,#080810,transparent)',
          pointerEvents: 'none',
        }} />

        {/* Header */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '14px 16px',
          background: 'linear-gradient(to bottom,rgba(8,8,16,0.75),transparent)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {/* Retour */}
          <button
            onClick={() => router.back()}
            style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'rgba(8,8,16,0.7)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff', fontSize: '16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >←</button>

          {/* Badge live */}
          <div style={{
            padding: '7px 14px',
            background: 'rgba(8,8,16,0.7)', backdropFilter: 'blur(12px)',
            border: `1px solid ${isDelivered ? 'rgba(34,197,94,0.3)' : isLive ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '99px',
            display: 'flex', alignItems: 'center', gap: '7px',
          }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: isDelivered ? '#22c55e' : isLive ? '#22c55e' : '#f59e0b',
              animation: isLive && !isDelivered ? 'blink 1.2s infinite' : 'none',
            }} />
            <span style={{
              color: isDelivered || isLive ? '#22c55e' : '#f59e0b',
              fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              fontFamily: "'DM Mono', monospace",
            }}>
              {isDelivered ? 'Livrée' : isLive ? 'En direct' : 'En attente'}
            </span>
          </div>

          {/* N° commande */}
          <div style={{
            padding: '7px 12px',
            background: 'rgba(8,8,16,0.7)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
          }}>
            <span style={{
              color: 'rgba(255,255,255,0.4)', fontSize: '11px',
              fontFamily: "'DM Mono', monospace",
            }}>
              #{(order.orderNumber || order.id.slice(-6)).toUpperCase()}
            </span>
          </div>
        </div>

        {/* Badge distance */}
        {distance !== null && !isDelivered && (
          <div style={{
            position: 'absolute', bottom: '28px', left: '50%',
            transform: 'translateX(-50%)',
            padding: '11px 22px',
            background: 'rgba(8,8,16,0.88)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: '99px',
            display: 'flex', alignItems: 'center', gap: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}>
            {/* Dot livreur */}
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: 'linear-gradient(135deg,#22c55e,#16a34a)',
              boxShadow: '0 0 8px rgba(34,197,94,0.6)',
            }} />

            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#fff', fontSize: '16px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}
              </p>
              {eta && (
                <p style={{
                  color: '#22c55e', fontSize: '10px', fontWeight: 600,
                  marginTop: '2px', fontFamily: "'DM Mono', monospace",
                }}>~{eta} min</p>
              )}
            </div>

            <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.07)' }} />

            {/* Dot destination */}
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: '#fff',
              border: '2px solid #22c55e',
              boxShadow: '0 0 8px rgba(34,197,94,0.4)',
            }} />
          </div>
        )}
      </div>

      {/* ══ BOTTOM SHEET ══ */}
      <div style={{
        flex: 1,
        background: '#0c0c16',
        borderRadius: '26px 26px 0 0',
        marginTop: '-26px',
        padding: '10px 20px 36px',
        display: 'flex', flexDirection: 'column', gap: '14px',
        overflowY: 'auto',
        animation: 'fadeUp 0.45s ease',
        border: '1px solid rgba(255,255,255,0.04)',
        borderBottom: 'none',
      }}>
        {/* Handle */}
        <div style={{
          width: '34px', height: '3px',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: '2px', margin: '8px auto 4px',
        }} />

        {/* ── ETA Card ── */}
        {!isDelivered && (
          <div style={{
            background: 'linear-gradient(135deg,rgba(34,197,94,0.08),rgba(22,163,74,0.04))',
            border: '1px solid rgba(34,197,94,0.18)',
            borderRadius: '22px', padding: '20px',
            display: 'flex', alignItems: 'center', gap: '18px',
            animation: 'glow 3s ease-in-out infinite',
          }}>
            {/* Icône cercle vert */}
            <div style={{
              width: '56px', height: '56px', borderRadius: '18px',
              background: 'linear-gradient(135deg,#22c55e,#16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 10px 24px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
              flexShrink: 0,
            }}>
              {/* Flèche SVG "en mouvement" */}
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div style={{ flex: 1 }}>
              <p style={{
                color: 'rgba(255,255,255,0.35)', fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                fontFamily: "'DM Mono', monospace", marginBottom: '4px',
              }}>Arrivée estimée</p>
              <p style={{
                color: '#fff', fontSize: '34px', fontWeight: 900,
                letterSpacing: '-0.03em', lineHeight: 1,
              }}>
                {eta ?? '—'}
                <span style={{ fontSize: '16px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginLeft: '4px' }}>min</span>
              </p>
              {distance !== null && (
                <p style={{ color: '#22c55e', fontSize: '12px', fontWeight: 600, marginTop: '5px' }}>
                  à {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(2)} km`} de chez vous
                </p>
              )}
            </div>

            {/* Dernière MAJ */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{
                color: 'rgba(255,255,255,0.15)', fontSize: '9px',
                fontFamily: "'DM Mono', monospace", letterSpacing: '0.05em',
              }}>MÀAJ</p>
              {secAgo !== null && (
                <p style={{
                  color: 'rgba(255,255,255,0.28)', fontSize: '12px',
                  fontFamily: "'DM Mono', monospace", marginTop: '3px',
                }}>
                  {secAgo < 60 ? `${secAgo}s` : `${Math.round(secAgo / 60)}m`}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Livrée ── */}
        {isDelivered && (
          <div style={{
            background: 'linear-gradient(135deg,rgba(34,197,94,0.1),rgba(21,128,61,0.05))',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: '22px', padding: '28px 20px', textAlign: 'center',
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'linear-gradient(135deg,#22c55e,#16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
              boxShadow: '0 0 24px rgba(34,197,94,0.4)',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p style={{ color: '#fff', fontSize: '20px', fontWeight: 800 }}>Commande livrée !</p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', marginTop: '6px' }}>Merci de votre confiance</p>
          </div>
        )}

        {/* ── Stepper ── */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '20px', padding: '20px 14px',
        }}>
          <Stepper status={order.status} />
        </div>

        {/* ── Adresse ── */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '18px', padding: '16px',
          display: 'flex', gap: '14px', alignItems: 'flex-start',
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {/* Pin SVG */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="#22c55e" opacity="0.8"/>
            </svg>
          </div>
          <div>
            <p style={{
              color: 'rgba(255,255,255,0.28)', fontSize: '10px', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.1em',
              fontFamily: "'DM Mono', monospace", marginBottom: '5px',
            }}>Adresse de livraison</p>
            <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '14px', fontWeight: 500, lineHeight: 1.5 }}>
              {order.customerLocation?.address || 'Adresse non renseignée'}
            </p>
          </div>
        </div>

        {/* ── Articles ── */}
        {order.items && order.items.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '18px', overflow: 'hidden',
          }}>
            <button
              onClick={() => setShowItems(v => !v)}
              style={{
                width: '100%', padding: '16px',
                background: 'transparent', border: 'none',
                display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer',
              }}
            >
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M9 12h6M9 16h4" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <p style={{
                  color: 'rgba(255,255,255,0.28)', fontSize: '10px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  fontFamily: "'DM Mono', monospace", marginBottom: '4px',
                }}>Commande</p>
                <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '13px', fontWeight: 500 }}>
                  {order.items.length} article{order.items.length > 1 ? 's' : ''}
                  {order.totalAmount ? ` · ${order.totalAmount.toFixed(2)} €` : ''}
                </p>
              </div>
              <div style={{
                width: '26px', height: '26px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.3)', fontSize: '16px',
                transform: showItems ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.25s ease',
              }}>›</div>
            </button>

            {showItems && (
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.04)',
                padding: '8px 16px 16px',
                display: 'flex', flexDirection: 'column', gap: '2px',
                animation: 'fadeUp 0.25s ease',
              }}>
                {order.items.map((item, i) => (
                  <div
                    key={i}
                    className="row-item"
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '9px 8px',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        color: '#22c55e', fontSize: '11px', fontWeight: 700,
                        fontFamily: "'DM Mono', monospace", minWidth: '22px',
                      }}>×{item.qty}</span>
                      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>{item.name}</span>
                    </div>
                    {item.price && (
                      <span style={{
                        color: 'rgba(255,255,255,0.28)', fontSize: '12px',
                        fontFamily: "'DM Mono', monospace",
                      }}>
                        {(item.price * item.qty).toFixed(2)} €
                      </span>
                    )}
                  </div>
                ))}
                {order.totalAmount && (
                  <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    marginTop: '6px', paddingTop: '10px',
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: '10px 8px 2px',
                  }}>
                    <span style={{
                      color: 'rgba(255,255,255,0.3)', fontSize: '11px',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      fontFamily: "'DM Mono', monospace",
                    }}>Total</span>
                    <span style={{ color: '#22c55e', fontSize: '16px', fontWeight: 800, letterSpacing: '-0.02em' }}>
                      {order.totalAmount.toFixed(2)} €
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Contacter le livreur ── */}
        {order.userPhone && (
          <a
            href={`tel:${order.userPhone}`}
            style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '16px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '18px',
              textDecoration: 'none',
              transition: 'border-color 0.2s',
            }}
          >
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{
                color: 'rgba(255,255,255,0.28)', fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.1em',
                fontFamily: "'DM Mono', monospace", marginBottom: '3px',
              }}>Contacter le livreur</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500 }}>
                {order.userPhone}
              </p>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '18px' }}>›</span>
          </a>
        )}

        <div style={{ height: '10px' }} />
      </div>
    </div>
  );
}

export default function TrackingClientPage() {
  return (
    <Suspense fallback={null}>
      <TrackingClientContent />
    </Suspense>
  );
}
