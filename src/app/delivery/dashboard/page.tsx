'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp, getDoc, writeBatch
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
// ✅ Le code de livraison appartient au client : ces deux appels
// remplacent les écritures Firestore directes ci-dessous (claimOrder,
// markAsDelivered) par des Cloud Functions qui génèrent/vérifient le
// code côté serveur — le livreur ne le voit jamais.
import { claimOrder as claimOrderSecure, confirmDeliveryWithCode, DeliveryCodeError } from '@/lib/deliveryCodeActions';

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

// Motifs prédéfinis pour le signalement rapide — couvrent les cas de
// terrain les plus fréquents (section 9 du cahier des charges). "Autre"
// laisse la note libre pour tout ce qui ne rentre pas dans ces cases.
const PROBLEM_REASONS = [
  'Client absent',
  'Vendeur fermé',
  'Adresse incorrecte',
  'Téléphone injoignable',
  'Produit indisponible',
  'Accident / panne',
  'Autre',
] as const;

function OrderCard({ order, onMarkDelivered, onMarkArrived, onRelease, currentLocation }: { order: Order; onMarkDelivered: (id: string) => void; onMarkArrived: (id: string) => void; onRelease: (id: string) => void; currentLocation?: Location | null }) {
  const [expanded, setExpanded] = useState(false);
  const [showDates, setShowDates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // ✅ NOUVEAU — signalement de problème en un geste. Avant, la seule façon
  // de renseigner dateProbleme/noteProbleme était d'ouvrir "Dates suivi",
  // choisir un champ, taper une date/heure manuellement puis écrire une
  // note libre : trop d'étapes pour un livreur planté devant une porte
  // fermée, en plein soleil, avec une seule main. Ici : un motif prédéfini
  // en un tap suffit ; la note libre reste disponible en option.
  const [showProblem, setShowProblem] = useState(false);
  const [problemReason, setProblemReason] = useState<typeof PROBLEM_REASONS[number] | null>(null);
  const [problemNote, setProblemNote] = useState('');
  const [reportingProblem, setReportingProblem] = useState(false);
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
      const payload = {
        dateDepart: dates.dateDepart || null,
        dateArrivee: dates.dateArrivee || null,
        dateRetour: dates.dateRetour || null,
        dateLivree: dates.dateLivree || null,
        dateProbleme: dates.dateProbleme || null,
        noteProbleme: dates.noteProbleme || null,
      };
      // ✅ FIX cohérence inter-collections (même bug que claimOrder/
      // markAsArrived/markAsDelivered ci-dessous) : cette fonction n'écrivait
      // QUE dans 'orders'. Le vendeur et l'admin, qui lisent 'seller_orders',
      // ne voyaient donc jamais les dates de suivi ni les notes de problème
      // saisies manuellement ici.
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', order.id), payload, { merge: true });
      const sellerOrderSnap = await getDoc(doc(db, 'seller_orders', order.id));
      if (sellerOrderSnap.exists()) {
        batch.set(doc(db, 'seller_orders', order.id), payload, { merge: true });
      }
      await batch.commit();
      setSaved(true);
      setTimeout(() => { setSaved(false); setShowDates(false); }, 1200);
    } catch {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // ✅ NOUVEAU — signalement rapide. Écrit dateProbleme + noteProbleme (même
  // champs que le panneau "Dates suivi", donc rien de nouveau côté
  // Firestore/règles/admin) dans 'orders' ET 'seller_orders' pour que le
  // vendeur et AgriMarché voient immédiatement le blocage, avec le même
  // motif choisi affiché dans la note. Ne touche jamais `status` : une
  // livraison signalée reste "en cours" tant qu'AgriMarché ou le livreur ne
  // la referme pas explicitement — pas de fermeture forcée depuis ce bouton.
  const reportProblem = async () => {
    if (!problemReason) return;
    setReportingProblem(true);
    try {
      const note = problemReason === 'Autre'
        ? (problemNote.trim() || 'Problème signalé (motif non précisé)')
        : problemNote.trim() ? `${problemReason} — ${problemNote.trim()}` : problemReason;
      const payload = { dateProbleme: nowLocal(), noteProbleme: note };
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', order.id), payload, { merge: true });
      const sellerOrderSnap = await getDoc(doc(db, 'seller_orders', order.id));
      if (sellerOrderSnap.exists()) {
        batch.set(doc(db, 'seller_orders', order.id), payload, { merge: true });
      }
      await batch.commit();
      // Pas d'affirmation "support notifié" ici : ce commit écrit
      // dateProbleme/noteProbleme, rien de plus — aucun trigger serveur
      // vérifié dans ce fichier n'envoie une alerte au support à cet
      // instant. Si un tel trigger existe côté functions/, le message peut
      // être enrichi ; sinon le bouton "🆘 Support" (WhatsApp) reste le
      // canal réel pour une urgence.
      toast.success('Problème signalé sur la commande');
      setShowProblem(false);
      setProblemReason(null);
      setProblemNote('');
    } catch {
      toast.error('Erreur lors du signalement — réessaie ou contacte le support');
    } finally {
      setReportingProblem(false);
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

        {/* ✅ NOUVEAU — "refuser lorsque le système le permet" (section 3 du
            cahier des charges) : un livreur peut se rendre compte juste
            après avoir accepté qu'il ne peut pas assurer cette course
            (trop loin, urgence personnelle, doublon...). Visible UNIQUEMENT
            tant que `tracking.phase === 'assigned'`, c'est-à-dire avant le
            premier point GPS envoyé pour cette commande (voir
            startSharingLocation, qui fait passer la phase à 'en_route' dès
            la première position reçue) — donc jamais une fois la course
            réellement commencée sur le terrain. Remet la commande dans le
            pool `en_preparation` pour qu'un autre livreur puisse la prendre. */}
        {order.tracking?.phase === 'assigned' && (
          <button
            onClick={() => onRelease(order.id)}
            style={{ ...btnStyleBtn('#fff7ed', '#c2410c'), width: '100%', marginBottom: '8px' }}
          >
            ↩️ Libérer cette commande
          </button>
        )}

        {/* Action row 2 — dates + problème + support */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <button onClick={() => setShowDates(s => !s)} style={btnStyleBtn(showDates ? '#ede9fe' : '#f1f5f9', showDates ? '#7c3aed' : '#475569')}>
            <Calendar size={13} />
            {showDates ? 'Fermer' : 'Dates'}
          </button>
          <button
            onClick={() => setShowProblem(s => !s)}
            style={btnStyleBtn(showProblem ? '#fee2e2' : '#fef2f2', '#ef4444')}
          >
            <AlertCircle size={13} />
            {showProblem ? 'Fermer' : 'Problème'}
          </button>
          <a href="https://wa.me/221779747073" target="_blank" rel="noopener noreferrer" style={btnStyle('#fff7ed', '#ea580c')}>
            🆘 Support
          </a>
        </div>

        {/* Panneau de signalement — motif en un tap, note libre optionnelle */}
        {showProblem && (
          <div style={{ marginTop: '10px', padding: '16px', background: '#fef2f2', borderRadius: '16px', border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={13} color="#ef4444" />
              <p style={{ color: '#ef4444', fontSize: '12px', fontWeight: 700 }}>SIGNALER UN PROBLÈME</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {PROBLEM_REASONS.map(reason => (
                <button
                  key={reason}
                  onClick={() => setProblemReason(reason)}
                  style={{
                    padding: '8px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    background: problemReason === reason ? '#ef4444' : '#ffffff',
                    color: problemReason === reason ? '#fff' : '#7f1d1d',
                    border: `1px solid ${problemReason === reason ? '#ef4444' : '#fecaca'}`,
                  }}
                >
                  {reason}
                </button>
              ))}
            </div>
            <textarea
              value={problemNote}
              onChange={e => setProblemNote(e.target.value)}
              placeholder={problemReason === 'Autre' ? 'Décris le problème...' : 'Détail optionnel...'}
              rows={2}
              style={{ width: '100%', padding: '9px 11px', border: '1px solid #fecaca', borderRadius: '10px', fontSize: '13px', color: '#1e293b', background: '#fff', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={reportProblem}
              disabled={!problemReason || reportingProblem}
              style={{
                padding: '12px', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '13px', fontWeight: 700,
                background: !problemReason ? '#fca5a5' : reportingProblem ? '#f87171' : '#ef4444',
                cursor: !problemReason || reportingProblem ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {reportingProblem ? 'Envoi...' : <><AlertCircle size={14} /> Confirmer le signalement</>}
            </button>
          </div>
        )}

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

// ─── Delivery Code Modal ───────────────────────────────────────────────────────
// ✅ NOUVEAU — remplace le window.confirm() aveugle de markAsDelivered.
// Le livreur ne voit JAMAIS le code : il saisit ici exactement ce que le
// CLIENT vient de lui dicter à voix haute, après avoir ouvert lui-même
// AgriMarché. Le serveur (confirmDeliveryWithCode) tranche.

function DeliveryCodeModal({
  orderId, orderNumber, onClose, onSubmit,
}: {
  orderId: string;
  orderNumber?: string;
  onClose: () => void;
  onSubmit: (orderId: string, code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (code.length !== 4) {
      setError('Le code comporte 4 chiffres.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(orderId, code);
    } catch (e: any) {
      setError(e?.message || 'Code incorrect.');
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        width: '100%', maxWidth: '480px', background: '#fff',
        borderRadius: '24px 24px 0 0', padding: '24px', paddingBottom: '32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#1e293b' }}>🔐 Code de validation requis</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        <p style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.5, margin: '8px 0 18px' }}>
          Demandez au client d'ouvrir AgriMarché{orderNumber ? ` (commande #${orderNumber})` : ''} et de vous
          communiquer le code affiché dans sa commande. Vous seul ne pouvez pas le connaître.
        </p>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={4}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="• • • •"
          style={{
            width: '100%', textAlign: 'center', fontSize: '32px', fontWeight: 800,
            letterSpacing: '12px', padding: '16px', borderRadius: '16px',
            border: error ? '2px solid #ef4444' : '2px solid #e2e8f0', color: '#1e293b',
            marginBottom: '10px', fontFamily: 'monospace',
          }}
        />
        {error && (
          <p style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center', marginBottom: '10px' }}>{error}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || code.length !== 4}
          style={{
            width: '100%', padding: '15px', borderRadius: '14px', border: 'none',
            background: submitting || code.length !== 4 ? '#cbd5e1' : 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', fontSize: '15px', fontWeight: 700,
            cursor: submitting || code.length !== 4 ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Vérification…' : 'Confirmer la livraison'}
        </button>
      </div>
    </div>
  );
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
  // ✅ NOUVEAU — modal de vérification du code de livraison (preuve de
  // livraison). `codeModalOrderId` porte l'id de la commande en cours de
  // confirmation ; null = modal fermé. Le code lui-même n'est jamais
  // détenu côté client : la vérification se fait côté serveur dans
  // confirmDeliveryWithCode (voir submitDeliveryCode ci-dessous).
  const [codeModalOrderId, setCodeModalOrderId] = useState<string | null>(null);
  // ✅ NOUVEAU — statut disponible/indisponible du livreur (section 2 du
  // cahier des charges), distinct du partage GPS. Par défaut `true` :
  // un livreur existant dont le champ `isAvailable` n'existe pas encore en
  // base doit continuer à voir les missions comme avant (pas de trou noir
  // silencieux le jour de ce déploiement). Écrit sur `users/{uid}`, la
  // collection déjà lue par `profile` — aucune nouvelle collection, aucune
  // règle Firestore à ajouter.
  const [isAvailable, setIsAvailable] = useState(true);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  useEffect(() => {
    if (!profile || availabilityLoaded) return;
    setIsAvailable(profile.isAvailable !== false);
    setAvailabilityLoaded(true);
  }, [profile, availabilityLoaded]);

  const toggleAvailability = useCallback(async () => {
    if (!user) return;
    const next = !isAvailable;
    setIsAvailable(next); // optimiste — un livreur dehors avec un réseau
    // faible ne doit pas attendre l'aller-retour Firestore pour voir son
    // propre bouton changer d'état.
    setSavingAvailability(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        isAvailable: next,
        availabilityUpdatedAt: serverTimestamp(),
      });
    } catch {
      setIsAvailable(!next); // rollback si l'écriture échoue réellement
      toast.error('Impossible de changer ton statut — vérifie ta connexion');
    } finally {
      setSavingAvailability(false);
    }
  }, [user, isAvailable]);

  // Ref à jour pour être lue depuis le listener temps réel des commandes
  // disponibles (effect à deps [user], qui ne doit pas se réabonner à
  // chaque toggle de disponibilité).
  const isAvailableRef = useRef(isAvailable);
  useEffect(() => { isAvailableRef.current = isAvailable; }, [isAvailable]);

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

  // Listen commandes disponibles : CONFIRMÉES par le vendeur (en_preparation)
  // OU tout juste passées (en_attente), tant qu'aucun livreur n'est encore
  // assigné.
  // 🐛 FIX : cette requête ne ciblait auparavant QUE 'en_preparation'. Une
  // commande qui vient d'être passée reste 'en_attente' jusqu'à ce que le
  // vendeur la confirme — parfois plusieurs minutes, parfois jamais si le
  // vendeur est lent à répondre. Pendant tout ce temps, la commande était
  // invisible pour TOUS les livreurs, même sans aucun delivererId. Elle
  // réapparaît maintenant dès sa création, permettant à un livreur de s'y
  // positionner à l'avance ; claimOrder (Cloud Function) gère les deux
  // cas : s'il est encore 'en_attente' au moment du clic, seul delivererId
  // est posé (le statut ne bouge pas, la confirmation du vendeur reste
  // requise) ; s'il est déjà 'en_preparation', le comportement historique
  // s'applique (passage direct à 'en_livraison'). Nécessite le firestore.rules
  // correspondant (resource.data.status in ['en_attente', 'en_preparation'])
  // — sans quoi Firestore refuse la requête list() en permission-denied.
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const prevAvailableCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('status', 'in', ['en_attente', 'en_preparation']));
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
      if (prevAvailableCountRef.current !== null && list.length > prevAvailableCountRef.current && isAvailableRef.current) {
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
      // ✅ Cette écriture directe (orders + seller_orders, delivererId,
      // status → en_livraison, code de livraison à 4 chiffres) vit
      // désormais côté serveur dans la Cloud Function claimOrder
      // (functions/src/deliveryCode.ts) — même comportement fonctionnel,
      // mais exécutée en transaction Admin SDK, ce qui permet d'y générer
      // le code de livraison sans jamais l'exposer au frontend du
      // livreur : le code appartient au client, jamais au livreur (voir
      // src/lib/deliveryCodeActions.ts). Le SMS "code de confirmation" est
      // supprimé — le code n'est plus jamais envoyé par SMS ; le client le
      // consulte dans "Mon compte" (voir account/orders/page.tsx) et le
      // communique de vive voix. La notification vendeur reste gérée par
      // notifyDelivererClaimed côté serveur, inchangée.
      await claimOrderSecure(orderId);
    } catch (e) {
      const message = e instanceof DeliveryCodeError ? e.message : "Cette commande vient peut-être d'être prise par un autre livreur.";
      alert(message);
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

  // ✅ NOUVEAU — miroir exact de claimOrder, en sens inverse : remet la
  // commande dans le pool des commandes disponibles pour un autre livreur.
  // N'est appelable côté UI que quand tracking.phase === 'assigned' (voir
  // OrderCard), donc jamais après un vrai début de course — mais on
  // revérifie ici côté client par sécurité, au cas où l'état local serait
  // périmé de quelques centaines de ms par rapport à Firestore.
  const releaseOrder = async (orderId: string) => {
    const order = ordersRef.current.find(o => o.id === orderId);
    if (order?.tracking?.phase && order.tracking.phase !== 'assigned') {
      toast.error('Cette course a déjà commencé, elle ne peut plus être libérée.');
      return;
    }
    if (!confirm('Libérer cette commande ? Elle redeviendra disponible pour un autre livreur.')) return;
    try {
      const payload = {
        delivererId: null, delivererName: null, delivererPhone: null,
        delivererAssignedAt: null,
        status: 'en_preparation' as const,
        'tracking.phase': null,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', orderId), payload, { merge: true });
      const sellerOrderSnap = await getDoc(doc(db, 'seller_orders', orderId));
      if (sellerOrderSnap.exists()) {
        batch.set(doc(db, 'seller_orders', orderId), payload, { merge: true });
      }
      await batch.commit();
      toast.success('Commande libérée');
    } catch { toast.error('Erreur — la commande est peut-être déjà partie plus loin.'); }
  };

  // ✅ Ne livre plus "à l'aveugle" sur un simple confirm() : ouvre la
  // modal de saisie du code que le CLIENT doit avoir communiqué au
  // livreur. La vérification réelle se fait côté serveur dans
  // submitDeliveryCode ci-dessous (bouton "Livré" de OrderCard).
  const markAsDelivered = (orderId: string) => {
    setCodeModalOrderId(orderId);
  };

  const submitDeliveryCode = async (orderId: string, code: string) => {
    // Le montant du gain (deliveryFee) est capturé pour le toast de
    // confirmation — il vient s'ajouter au solde du livreur (panneau
    // "Mes gains", calculé dynamiquement à partir des commandes 'livre').
    const order = ordersRef.current.find(o => o.id === orderId);
    try {
      // ✅ Remplace l'ancienne écriture directe (orders + seller_orders,
      // status → 'livre') par confirmDeliveryWithCode côté serveur : le
      // code saisi ici est celui que le client vient de donner au
      // livreur, vérifié en transaction contre le hash stocké par
      // claimOrder. Le miroir seller_orders reste synchronisé côté
      // serveur, et l'écriture est garantie atomique (5 tentatives max,
      // usage unique).
      await confirmDeliveryWithCode(orderId, code);
      setCodeModalOrderId(null);
      toast.success(
        order?.deliveryFee
          ? `Livraison confirmée ! +${formatFCFA(order.deliveryFee)} ajoutés à votre solde`
          : 'Livraison confirmée !'
      );

      // Notifications acheteur/vendeur : notifyOrderStatusStep côté
      // serveur, déclenché par le passage à 'livre' ci-dessus.

      // SMS "commande livrée, bon appétit" : best-effort, distinct du
      // code de livraison (qui, lui, n'est plus jamais envoyé par SMS).
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
    } catch (e) {
      const message = e instanceof DeliveryCodeError ? e.message : 'Erreur lors de la validation';
      toast.error(message);
      throw e; // la modal reste ouverte et affiche l'erreur inline
    }
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
    const hasAvailable = isAvailable && availableOrders.length > 0;
    if (hasActive) setActiveTab('encours');
    else if (hasAvailable) setActiveTab('disponibles');
    else setActiveTab('terminees');
    setAutoTabSet(true);
  }, [loading, orders, availableOrders, autoTabSet, isAvailable]);

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

          {/* ✅ NOUVEAU : statut disponible/indisponible — juge à lui seul si
              le livreur reçoit des propositions de mission (section 2 du
              cahier des charges). Grande cible tactile en haut, avant même
              le solde : c'est la première décision du livreur en ouvrant
              l'app, avant de regarder quoi que ce soit d'autre. */}
          <button
            onClick={toggleAvailability}
            disabled={savingAvailability}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: isAvailable ? 'rgba(16,185,129,0.16)' : 'rgba(148,163,184,0.14)',
              border: `1px solid ${isAvailable ? 'rgba(16,185,129,0.4)' : 'rgba(148,163,184,0.35)'}`,
              borderRadius: '14px', padding: '13px 14px', marginBottom: '10px',
              cursor: savingAvailability ? 'default' : 'pointer', opacity: savingAvailability ? 0.7 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: isAvailable ? '#10b981' : '#94a3b8',
                boxShadow: isAvailable ? '0 0 0 3px rgba(16,185,129,0.25)' : 'none',
              }} />
              <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>
                {isAvailable ? 'Disponible' : 'Indisponible'}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                {isAvailable ? '— tu reçois des missions' : '— en pause'}
              </span>
            </div>
            <span style={{
              padding: '5px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 700,
              background: isAvailable ? '#ef4444' : '#10b981', color: '#fff',
            }}>
              {savingAvailability ? '...' : isAvailable ? 'Passer en pause' : 'Activer'}
            </span>
          </button>

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
          !isAvailable ? (
            // ✅ NOUVEAU : tant que le livreur est en pause, on ne propose
            // aucune mission — cohérent avec le statut affiché en haut de
            // l'écran. Le nombre réel de courses en attente reste visible
            // (honnête, pas de chiffre masqué) pour donner envie de se
            // réactiver, mais la liste elle-même n'apparaît qu'une fois
            // redevenu disponible.
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '48px 24px', textAlign: 'center' }}>
              <WifiOff size={44} color="#cbd5e1" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#475569', fontWeight: 500, fontSize: '16px', marginBottom: '4px' }}>Tu es en pause</p>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
                {sortedAvailable.length > 0
                  ? `${sortedAvailable.length} course(s) en attente — active-toi pour les voir`
                  : 'Aucune course en attente pour le moment'}
              </p>
              <button
                onClick={toggleAvailability}
                disabled={savingAvailability}
                style={{ padding: '11px 24px', background: '#10b981', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: savingAvailability ? 'default' : 'pointer' }}
              >
                Passer disponible
              </button>
            </div>
          ) : sortedAvailable.length === 0 ? (
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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{ padding: '4px 10px', background: '#dcfce7', borderRadius: '99px', color: '#059669', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        Gain {formatFCFA(order.deliveryFee ?? 0)}
                      </span>
                      {/* ✅ NOUVEAU : distingue les commandes déjà confirmées par
                          le vendeur (prêtes à partir immédiatement) de celles
                          encore 'en_attente' (le livreur peut se positionner en
                          avance, mais la préparation n'a pas encore commencé). */}
                      {order.status === 'en_attente' && (
                        <span style={{ padding: '3px 9px', background: '#fef3c7', borderRadius: '99px', color: '#b45309', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          En attente du vendeur
                        </span>
                      )}
                    </div>
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
                <OrderCard key={order.id} order={order} onMarkDelivered={markAsDelivered} onMarkArrived={markAsArrived} onRelease={releaseOrder} currentLocation={currentLocation} />
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

      {codeModalOrderId && (
        <DeliveryCodeModal
          orderId={codeModalOrderId}
          orderNumber={ordersRef.current.find(o => o.id === codeModalOrderId)?.orderNumber}
          onClose={() => setCodeModalOrderId(null)}
          onSubmit={submitDeliveryCode}
        />
      )}
    </div>
  );
}

