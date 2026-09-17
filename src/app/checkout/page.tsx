'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import LocationEditor from '@/components/LocationEditor';
import { distanceKm, isPlausibleSenegalCoordinate } from '@/lib/geo/distance';
import { DAKAR_CENTER, ROAD_DISTANCE_FACTOR, isUsableRecord, type LocationRecord } from '@/lib/geo/quality';
import { readSavedDeliveryAddress, saveDeliveryAddress } from '@/lib/geo/userLocation';

// Adresse de livraison choisie, gardée le temps du paiement (retour Wave =
// rechargement complet de la page : sans ça, l'adresse confirmée était perdue
// et la commande repartait avec une position re-détectée ou Dakar par défaut).
const DELIVERY_POINT_KEY = 'checkout_delivery_point';
function readStoredDeliveryPoint(): LocationRecord | null {
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem(DELIVERY_POINT_KEY) : null;
    const rec = raw ? JSON.parse(raw) : null;
    return isUsableRecord(rec) ? rec : null;
  } catch {
    return null;
  }
}

// Point de retrait d'un vendeur, lu sur ses documents produits (publics).
// Les profils users/{vendeur} ne sont PAS lisibles par un acheteur (règles
// Firestore) : l'ancienne lecture échouait toujours en silence → toutes les
// commandes partaient avec « Dakar, Sénégal » comme point de retrait.
type SellerPoint = { lat: number; lng: number; address: string; source: string | null; accuracy: number | null; updatedAt: unknown };
function sellerPointFromProduct(p: any): SellerPoint | null {
  if (!p || !isPlausibleSenegalCoordinate(p.lat, p.lng)) return null;
  return {
    lat: p.lat,
    lng: p.lng,
    address: p.locationAddress || p.exactLocation || p.region || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    source: p.locationSource || null,
    accuracy: typeof p.locationAccuracy === 'number' ? p.locationAccuracy : null,
    updatedAt: p.locationUpdatedAt ?? null,
  };
}
import {
  collection, addDoc, Timestamp, doc, updateDoc, getDoc, setDoc, runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import {
  ShoppingBag, CheckCircle, Truck, MapPin, Mail, User, Leaf,
  ArrowLeft, Sparkles, Package, CreditCard, Navigation,
  Loader2, ChevronRight, Gift, Smartphone, Banknote,
  Copy, Check, AlertCircle, Shield, Lock, Phone,
  Receipt, Zap, ExternalLink,
} from 'lucide-react';
import { initDeliveryTracking, getEstimatedDeliveryDate } from '@/lib/deliveryTracking';
import { notifyUser } from '@/lib/notifications/notifyUser';
import { apiUrl } from '@/lib/api-config';
// ✅ Commande sans compte : session invité (déterministe par téléphone,
// sans mot de passe, sans SMS) démarrée juste avant la création de la
// commande — voir startGuestCheckoutSession (Cloud Function).
import { startGuestCheckoutSession, DeliveryCodeError } from '@/lib/deliveryCodeActions';

/* ─────────────────────────────────────────────
   Styles injectés globalement
───────────────────────────────────────────── */
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');

  :root {
    --ivory:   #FAFAF8;
    --white:   #FFFFFF;
    --gold:    #C9A96E;
    --gold-lt: #E8D5B0;
    --ink:     #1A1A1A;
    --ink-md:  #4A4A4A;
    --ink-lt:  #9A9A9A;
    --border:  rgba(201,169,110,0.18);
    --shadow:  0 4px 40px rgba(26,26,26,0.06);
    --shadow-lg: 0 16px 64px rgba(26,26,26,0.10);
  }

  .checkout-root * { font-family: 'DM Sans', sans-serif; }
  .checkout-root { background: var(--ivory); min-height: 100vh; }

  .serif { font-family: 'Cormorant Garamond', Georgia, serif; }

  .card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: var(--shadow);
    overflow: hidden;
    transition: box-shadow 0.3s ease;
  }
  .card:hover { box-shadow: var(--shadow-lg); }

  .card-header {
    padding: 20px 28px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .card-header-title {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-md);
  }
  .card-header-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--gold);
    flex-shrink: 0;
  }

  .card-body { padding: 24px 28px; }

  .info-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: var(--ivory);
    border-radius: 12px;
    border: 1px solid transparent;
    transition: border-color 0.2s;
  }
  .info-row:hover { border-color: var(--border); }
  .info-row-label { font-size: 11px; color: var(--ink-lt); letter-spacing: 0.06em; text-transform: uppercase; }
  .info-row-value { font-size: 14px; color: var(--ink); font-weight: 500; margin-top: 2px; }

  .icon-circle {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--gold-lt), var(--gold));
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    color: white;
  }

  .pay-option {
    display: flex; align-items: center; gap: 16px;
    padding: 18px 20px;
    border-radius: 14px;
    border: 1.5px solid var(--border);
    cursor: pointer;
    transition: all 0.25s ease;
    background: var(--white);
    position: relative;
  }
  .pay-option:hover { border-color: var(--gold); background: #FFFDF9; }
  .pay-option.selected {
    border-color: var(--gold);
    background: linear-gradient(135deg, #FFFDF9, #FDF8EE);
    box-shadow: 0 0 0 4px rgba(201,169,110,0.08);
  }
  .pay-option input[type="radio"] { display: none; }
  .pay-radio {
    width: 18px; height: 18px;
    border-radius: 50%;
    border: 2px solid var(--border);
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 0.2s;
  }
  .pay-option.selected .pay-radio { border-color: var(--gold); }
  .pay-radio-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--gold);
    opacity: 0;
    transform: scale(0);
    transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
  }
  .pay-option.selected .pay-radio-dot { opacity: 1; transform: scale(1); }

  .location-btn {
    width: 100%;
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px;
    border-radius: 14px;
    background: linear-gradient(135deg, #FFFDF9, #FDF5E4);
    border: 1.5px solid var(--gold-lt);
    cursor: pointer;
    transition: all 0.25s;
  }
  .location-btn:hover { border-color: var(--gold); box-shadow: 0 4px 20px rgba(201,169,110,0.12); }

  .cta-btn {
    width: 100%;
    padding: 18px;
    border-radius: 14px;
    background: var(--ink);
    color: var(--white);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border: none;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }
  .cta-btn::before {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(135deg, var(--gold), #A07840);
    opacity: 0;
    transition: opacity 0.3s;
  }
  .cta-btn:hover::before { opacity: 1; }
  .cta-btn > * { position: relative; z-index: 1; }
  .cta-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cta-btn:disabled::before { display: none; }

  .sep { height: 1px; background: var(--border); margin: 16px 0; }

  .cart-item {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .cart-item:last-child { border-bottom: none; }
  .cart-thumb {
    width: 46px; height: 46px;
    border-radius: 10px;
    background: linear-gradient(135deg, #F0FAF4, #D4F0E0);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .total-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px;
  }
  .total-row.grand {
    padding-top: 14px;
    margin-top: 6px;
    border-top: 1px solid var(--border);
  }

  .err-box {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 16px;
    border-radius: 10px;
    background: #FFF5F5;
    border: 1px solid #FFD5D5;
    color: #C0392B;
    font-size: 13px;
  }

  .success-root {
    min-height: 100vh;
    background: var(--ivory);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .success-card {
    max-width: 480px; width: 100%;
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 28px;
    box-shadow: var(--shadow-lg);
    padding: 52px 44px;
    text-align: center;
  }
  .success-icon-ring {
    width: 88px; height: 88px;
    border-radius: 50%;
    border: 1.5px solid var(--gold-lt);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 28px;
    animation: ring-pulse 2s ease infinite;
  }
  @keyframes ring-pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(201,169,110,0.3); }
    50% { box-shadow: 0 0 0 12px rgba(201,169,110,0); }
  }
  .success-order-badge {
    display: inline-block;
    padding: 8px 20px;
    border-radius: 999px;
    background: linear-gradient(135deg, #FFFDF9, #FDF5E4);
    border: 1px solid var(--gold-lt);
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: var(--gold);
    font-weight: 600;
    letter-spacing: 0.08em;
    margin: 10px 0 24px;
  }

  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(26,26,26,0.55);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    z-index: 50; padding: 16px;
    animation: fade-in 0.2s ease;
  }
  @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
  .modal-card {
    background: var(--white);
    border-radius: 24px;
    box-shadow: 0 32px 80px rgba(26,26,26,0.20);
    width: 100%; max-width: 440px;
    overflow: hidden;
    animation: slide-up 0.3s cubic-bezier(0.34,1.2,0.64,1);
  }
  @keyframes slide-up { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

  .input-field {
    width: 100%;
    padding: 14px 18px;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    font-size: 14px;
    color: var(--ink);
    background: var(--white);
    outline: none;
    transition: border-color 0.2s;
    font-family: 'DM Sans', sans-serif;
  }
  .input-field:focus { border-color: var(--gold); }

  .tag {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .tag-gold {
    background: linear-gradient(135deg, #FFFDF9, #FDF5E4);
    border: 1px solid var(--gold-lt);
    color: var(--gold);
  }
  .tag-green {
    background: #F0FAF4;
    border: 1px solid #A8E6C0;
    color: #1E7A44;
  }

  .animate-enter {
    animation: enter 0.5s ease both;
  }
  @keyframes enter { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
  .delay-1 { animation-delay: 0.08s }
  .delay-2 { animation-delay: 0.16s }
  .delay-3 { animation-delay: 0.24s }
  .delay-4 { animation-delay: 0.32s }
`;

/* ─────────────────────────────────────────────
   Acompte (paiement partiel à la commande)
───────────────────────────────────────────── */
const DEPOSIT_RATE = 0.25; // 25% à payer maintenant, le reste à la livraison
const DEPOSIT_SURCHARGE = 1.02; // majoration interne appliquée à l'acompte uniquement — ne jamais afficher ce taux ni l'exposer côté UI

/* ─────────────────────────────────────────────
   Payment Config
───────────────────────────────────────────── */
const PAYMENT_METHODS_CONFIG = {
  wave: {
    id: 'wave',
    name: 'Wave',
    description: 'Paiement instantané, sécurisé',
    icon: <Smartphone size={17} />,
    fee: 0,
    paymentLink: (amount: number) => {
      return `https://pay.wave.com/m/M_sn_G4vyn-BvhQxV/c/sn/`;
    },
    minAmount: 100,
    maxAmount: 1000000,
  },
  orange_money: {
    id: 'orange_money',
    name: 'Orange Money',
    description: 'Paiement mobile Orange',
    icon: <Smartphone size={17} />,
    fee: 0,
    paymentLink: null,
    merchantPhone: '77 974 70 73',
    minAmount: 100,
    maxAmount: 1000000,
  },
};

/* ─────────────────────────────────────────────
   Payment Modal simplifié (sans confirmation ID)
───────────────────────────────────────────── */
// ─── Guest Checkout Modal ──────────────────────────────────────────────────
// ✅ NOUVEAU — remplace la redirection forcée vers /auth/login. Minimum
// d'informations nécessaires : un téléphone suffit, le nom est optionnel.
// Aucun SMS envoyé ici — la session s'ouvre directement via
// startGuestCheckoutSession.
function GuestCheckoutModal({
  phone, setPhone, name, setName, error, submitting, onContinue, onCreateAccount, onLogin, onClose,
}: {
  phone: string; setPhone: (v: string) => void;
  name: string; setName: (v: string) => void;
  error: string; submitting: boolean;
  onContinue: () => void; onCreateAccount: () => void; onLogin: () => void; onClose: () => void;
}) {
  return (
    <div className="modal-card" style={{ maxWidth: 420 }}>
      <div className="modal-header" style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold-lt), var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Phone size={24} color="#fff" />
        </div>
        <h3 className="serif" style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>Continuer sans compte</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-lt)', marginTop: 6, lineHeight: 1.5 }}>
          Juste votre numéro — vous en aurez besoin pour retrouver votre commande et votre code de livraison.
        </p>
      </div>
      <div style={{ padding: '24px 28px' }}>
        <input
          type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          placeholder="Ex. 77 123 45 67" autoFocus
          style={{ width: '100%', padding: '13px 16px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, marginBottom: 10 }}
        />
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Votre nom (optionnel)"
          style={{ width: '100%', padding: '13px 16px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, marginBottom: 4 }}
        />
        {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginTop: 8, lineHeight: 1.4 }}>{error}</p>}
        <button onClick={onContinue} disabled={submitting} className="cta-btn" style={{ marginTop: 18, width: '100%' }}>
          {submitting ? 'Un instant…' : 'Continuer'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 12px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--ink-lt)' }}>ou</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <button
          onClick={onCreateAccount}
          style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1.5px solid #059669', background: '#fff', color: '#059669', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Créer mon compte
        </button>
        <p style={{ fontSize: 11.5, color: 'var(--ink-lt)', textAlign: 'center', marginTop: 6, lineHeight: 1.4 }}>
          Suivez vos commandes et gardez votre adresse pour la prochaine fois.
        </p>
        <button onClick={onLogin} style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: 'var(--ink-lt)', fontSize: 12, cursor: 'pointer' }}>
          Déjà inscrit ? Se connecter
        </button>
        <button onClick={onClose} style={{ marginTop: 2, width: '100%', background: 'none', border: 'none', color: 'var(--ink-lt)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
          Retour
        </button>
      </div>
    </div>
  );
}

function PaymentModal({ method, amount, remainingAmount, onConfirm, onBack }: { method: any; amount: number; remainingAmount: number; onConfirm: () => void; onBack: () => void }) {
  const wavePaymentUrl = method.paymentLink ? method.paymentLink(amount) : null;

  // Sauvegarder le contexte AVANT de partir vers Wave
  // Au retour, CheckoutPage detecte 'wave_pending' et cree la commande auto
  useEffect(() => {
    if (method.id === 'wave' && wavePaymentUrl) {
      sessionStorage.setItem('wave_pending', JSON.stringify({ paymentMethod: 'wave', ts: Date.now() }));
      window.location.href = wavePaymentUrl;
    }
  }, []);

  const handleManualConfirm = () => { onConfirm(); };

  return (
    <div className="modal-card" style={{ maxWidth: 460 }}>
      <div className="modal-header" style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold-lt), var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          {method.icon}
        </div>
        <h3 className="serif" style={{ fontSize: 22, fontWeight: 400, color: 'var(--ink)' }}>Acompte {method.name}</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-lt)', marginTop: 6 }}>Acompte (25%) : <strong>{amount.toLocaleString()} FCFA</strong></p>
        <p style={{ fontSize: 11, color: 'var(--ink-lt)', marginTop: 4 }}>Solde à régler à la livraison : {remainingAmount.toLocaleString()} FCFA</p>
      </div>

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center' }}>
        {method.id === 'wave' ? (
          <>
            <div style={{ background: 'var(--ivory)', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 12 }}>
                Vous allez être redirigé vers Wave pour effectuer le paiement de l'acompte (25%).
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
                <Shield size={16} style={{ color: 'var(--gold)' }} />
                <span style={{ fontSize: 11, color: 'var(--ink-lt)' }}>Paiement sécurisé</span>
              </div>
            </div>
            <button onClick={handleManualConfirm} className="cta-btn">
              <CheckCircle size={16} />
              J'ai payé l'acompte, confirmer ma commande
            </button>
          </>
        ) : (
          <>
            <div style={{ background: 'var(--ivory)', borderRadius: 12, padding: '20px' }}>
              <p style={{ fontSize: 13, color: 'var(--ink-md)', marginBottom: 12 }}>Envoyez l'acompte (25%) à :</p>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.08em', marginBottom: 8 }}>
                +221 {method.merchantPhone}
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink-lt)' }}>via Orange Money</p>
              <p style={{ fontSize: 11, color: 'var(--ink-lt)', marginTop: 10 }}>Solde de {remainingAmount.toLocaleString()} FCFA à régler à la livraison</p>
            </div>
            <button onClick={handleManualConfirm} className="cta-btn">
              <CheckCircle size={16} />
              J'ai payé l'acompte, confirmer ma commande
            </button>
          </>
        )}

        <button onClick={onBack} style={{ fontSize: 11, color: 'var(--ink-lt)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }}>
          ← Annuler
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Checkout Page
───────────────────────────────────────────── */
export default function CheckoutPage() {
  const router = useRouter();
  const { user, profile, patchLocalProfile } = useAuth() as any;
  const { cart, clearCart } = useCart() as { cart: { items: any[]; total: number; itemCount: number }; clearCart: () => void };
  // ── Adresse de livraison ──────────────────────────────────────────────
  // Une seule source : le point CONFIRMÉ par le client (GPS précis, lieu
  // recherché ou point placé sur la carte). Plus de repli silencieux sur
  // la position IP ou le centre de Dakar : sans adresse confirmée, pas de
  // commande — le livreur ne doit jamais partir vers un point inventé.
  const [deliveryPoint, setDeliveryPoint] = useState<LocationRecord | null>(null);
  const [editingDelivery, setEditingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');

  useEffect(() => {
    // L'adresse gardée en session ne sert QU'AU retour du paiement Wave. Hors
    // de ce cas, on repart de l'adresse enregistrée sur le compte : sinon une
    // adresse modifiée entre-temps (« Mon adresse ») serait ignorée.
    let wavePending = false;
    try { wavePending = !!sessionStorage.getItem('wave_pending'); } catch { /* ignore */ }
    if (!wavePending) {
      try { sessionStorage.removeItem(DELIVERY_POINT_KEY); } catch { /* ignore */ }
      return;
    }
    const stored = readStoredDeliveryPoint();
    if (stored) setDeliveryPoint(stored);
  }, []);
  useEffect(() => {
    if (deliveryPoint) return;
    const saved = readSavedDeliveryAddress(profile);
    if (saved) setDeliveryPoint(saved);
  }, [profile, deliveryPoint]);
  useEffect(() => {
    if (!deliveryPoint) return;
    try { sessionStorage.setItem(DELIVERY_POINT_KEY, JSON.stringify(deliveryPoint)); } catch { /* ignore */ }
  }, [deliveryPoint]);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [orderBalance, setOrderBalance] = useState(0);
  const [isMultiVendorOrder, setIsMultiVendorOrder] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('wave');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activePaymentMethod, setActivePaymentMethod] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [waveReturn, setWaveReturn] = useState(false);
  // ── Checkout invité (sans compte) ─────────────────────────────────
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestPhone, setGuestPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestError, setGuestError] = useState('');
  const pendingGuestCheckoutRef = useRef(false);

  // Detection retour Wave
  useEffect(() => {
    const pending = sessionStorage.getItem('wave_pending');
    if (!pending) return;
    try {
      const saved = JSON.parse(pending);
      if (saved.paymentMethod === 'wave') {
        setSelectedPaymentMethod('wave');
        setWaveReturn(true);
        sessionStorage.removeItem('wave_pending');
      }
    } catch { sessionStorage.removeItem('wave_pending'); }
  }, []);

  const cartItems = useMemo(() => cart?.items || [], [cart]);
  const subtotal = useMemo(() => cart?.total || 0, [cart]);
  const isFreeDelivery = subtotal >= 5000;

  // Points de retrait des vendeurs du panier (documents produits relus à
  // jour — pas la copie figée dans le panier au moment de l'ajout).
  const [sellerPoints, setSellerPoints] = useState<Record<string, SellerPoint>>({});
  useEffect(() => {
    const bySeller = new Map<string, string[]>();
    cartItems.forEach((it: any) => {
      const sid = it?.product?.sellerId;
      const pid = it?.product?.id;
      if (!sid || !pid) return;
      bySeller.set(sid, [...(bySeller.get(sid) || []), pid]);
    });
    let cancelled = false;
    (async () => {
      const next: Record<string, SellerPoint> = {};
      for (const [sid, pids] of bySeller) {
        for (const pid of pids.slice(0, 3)) {
          try {
            const snap = await getDoc(doc(db, 'products', pid));
            const point = sellerPointFromProduct(snap.data());
            if (point) { next[sid] = point; break; }
          } catch { /* produit illisible : on essaie le suivant */ }
        }
      }
      if (!cancelled) setSellerPoints(next);
    })();
    return () => { cancelled = true; };
  }, [cartItems]);

  // Distance ROUTIÈRE estimée vendeur → client (la plus longue si plusieurs
  // vendeurs). Avant : distance au centre de Dakar, quel que soit le vendeur.
  // Vendeur sans point connu → centre de Dakar, comme avant.
  const deliveryDistanceKm = useMemo(() => {
    if (!deliveryPoint) return null;
    const sellerIds = [...new Set(cartItems.map((it: any) => it?.product?.sellerId).filter(Boolean))] as string[];
    const origins: Array<{ lat: number; lng: number }> = sellerIds.map((sid) => sellerPoints[sid] || DAKAR_CENTER);
    const list = origins.length ? origins : [DAKAR_CENTER];
    return Math.max(...list.map((o) => distanceKm(o.lat, o.lng, deliveryPoint.lat, deliveryPoint.lng))) * ROAD_DISTANCE_FACTOR;
  }, [deliveryPoint, cartItems, sellerPoints]);

  const deliveryFee = useMemo(() => {
    if (isFreeDelivery) return 0;
    if (deliveryDistanceKm === null) return 1000;
    const dist = deliveryDistanceKm;
    if (dist <= 10) return 1000;
    if (dist <= 30) return 1000;
    if (dist <= 100) return 1500;
    return 2000;
  }, [deliveryDistanceKm, isFreeDelivery]);

  const total = subtotal + deliveryFee;
  const depositAmount = Math.round(total * DEPOSIT_RATE * DEPOSIT_SURCHARGE);
  const remainingAmount = total - depositAmount;

  const estimatedDelivery = useMemo(() => {
    if (isFreeDelivery) return '24 – 48 h (Express)';
    if (deliveryDistanceKm === null) return 'À confirmer';
    const dist = deliveryDistanceKm;
    if (dist <= 10) return '24 h';
    if (dist <= 30) return '24 – 48 h';
    if (dist <= 100) return '48 – 72 h';
    return '3 – 5 jours';
  }, [deliveryDistanceKm, isFreeDelivery]);

  const generateOrderNumber = useCallback(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const r = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `AGR-${y}${m}${day}-${r}`;
  }, []);

  const createOrder = async () => {
    if (cartItems.length === 0) { setOrderError('Votre panier est vide'); return false; }
    // ✅ FIX : sans ce garde-fou, si createOrder() se déclenche avant que Firebase
    // Auth ait fini de restaurer la session (ex : juste après le retour de paiement
    // Wave, au rechargement de la page), `user` est encore `null` ici, et la commande
    // partait avec userId: "guest-user" — une chaîne qui ne correspond à aucun UID
    // réel. Résultat : le vrai propriétaire ne peut plus jamais annuler/confirmer
    // cette commande (isOwner() dans firestore.rules ne matche jamais "guest-user").
    if (!user) {
      setOrderError('Session expirée, reconnecte-toi pour continuer.');
      setIsProcessing(false);
      router.push('/auth/login?redirect=/checkout');
      return false;
    }
    const orderDeliveryPoint = deliveryPoint ?? readStoredDeliveryPoint();
    if (!orderDeliveryPoint) {
      setOrderError('Indiquez votre adresse de livraison avant de commander.');
      setEditingDelivery(true);
      setIsProcessing(false);
      return false;
    }
    setIsProcessing(true); setOrderError('');
    try {
      // ─────────────────────────────────────────────────────────────────
      // ✅ FIX SURVENTE : avant, le stock était décrémenté avec un simple
      // `updateDoc(..., { stock: increment(-qty) })` APRÈS la création de
      // la commande, sans jamais vérifier qu'il restait assez d'unités.
      // Si 2 acheteurs commandaient en même temps le dernier exemplaire
      // d'un produit, les 2 commandes étaient acceptées et le stock
      // passait à -1 — le vendeur ne pouvait en livrer qu'une.
      //
      // On regroupe les quantités par produit (un même article peut, en
      // théorie, apparaître dans plusieurs lignes du panier) et on
      // vérifie + réserve le stock de TOUT le panier en une seule
      // transaction Firestore, AVANT de créer la moindre commande.
      // `runTransaction` relit le stock au moment exact de l'écriture et
      // réessaie automatiquement en cas de conflit avec une autre
      // transaction concurrente sur le même produit — deux acheteurs qui
      // valident au même instant sont donc sérialisés par Firestore, pas
      // par notre code : l'un des deux verra toujours le stock à jour.
      // stock === null/undefined reste traité comme "illimité" (voir
      // seller/products/add/page.tsx), donc jamais bloqué ici.
      const qtyByProduct = new Map<string, number>();
      for (const item of cartItems) {
        if (!item?.product?.id) continue;
        qtyByProduct.set(item.product.id, (qtyByProduct.get(item.product.id) || 0) + (item.quantity || 1));
      }
      try {
        await runTransaction(db, async (tx) => {
          const entries = [...qtyByProduct.entries()];
          const productRefs = entries.map(([productId]) => doc(db, 'products', productId));
          // Toutes les lectures de la transaction doivent précéder ses écritures.
          const snaps = await Promise.all(productRefs.map(ref => tx.get(ref)));
          const shortages: { name: string; available: number }[] = [];
          snaps.forEach((snap, idx) => {
            const [, qty] = entries[idx];
            if (!snap.exists()) { shortages.push({ name: 'Produit indisponible', available: 0 }); return; }
            const data = snap.data() as any;
            const currentStock = data?.stock;
            if (currentStock === null || currentStock === undefined) return; // illimité
            if (currentStock < qty) shortages.push({ name: data?.name || 'Produit', available: Math.max(0, currentStock) });
          });
          if (shortages.length > 0) {
            const detail = shortages.map(s => `${s.name} (${s.available} dispo.)`).join(', ');
            throw new Error(`STOCK_INSUFFISANT: ${detail}`);
          }
          snaps.forEach((snap, idx) => {
            const currentStock = (snap.data() as any)?.stock;
            if (currentStock === null || currentStock === undefined) return; // illimité, rien à décrémenter
            const [, qty] = entries[idx];
            tx.update(productRefs[idx], { stock: currentStock - qty });
          });
        });
      } catch (stockErr: any) {
        const msg = String(stockErr?.message || '');
        if (msg.startsWith('STOCK_INSUFFISANT:')) {
          setOrderError(`Stock insuffisant pour : ${msg.replace('STOCK_INSUFFISANT: ', '')}. Merci de mettre à jour votre panier.`);
        } else {
          console.error('stock transaction:', stockErr);
          setOrderError('Impossible de vérifier le stock. Veuillez réessayer.');
        }
        setIsProcessing(false);
        return false;
      }
      // Alerte "stock bas" événementielle, best-effort — voir plus loin
      // pour le détail (ancien emplacement, déplacé ici puisque le stock
      // est désormais décrémenté ci-dessus, avant la création des commandes).
      for (const [productId] of qtyByProduct) {
        fetch(apiUrl('/api/products/check-stock'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId }),
        }).catch(() => {});
      }

      // ─────────────────────────────────────────────────────────────────
      // ✅ FIX MULTI-VENDEUR : un panier peut contenir des produits de
      // plusieurs vendeurs. Avant, une seule commande Firestore était créée
      // avec le sellerId du PREMIER article du panier seulement
      // (`cartItems[0].product.sellerId`) — tous les articles y compris
      // ceux d'un AUTRE vendeur étaient rattachés à cette unique commande.
      // Résultat : seul le premier vendeur recevait la commande dans
      // seller_orders + la notification ; les autres vendeurs ne voyaient
      // jamais qu'un de leurs produits avait été commandé.
      //
      // On regroupe maintenant le panier par sellerId et on crée UNE
      // commande Firestore PAR VENDEUR, chacune avec son propre acompte,
      // reliées par un même `orderGroupId` (même numéro de base, suffixé
      // -A/-B/... si plusieurs vendeurs) pour que le client les voie comme
      // un seul achat sur /account/orders.
      // ─────────────────────────────────────────────────────────────────
      const groupsMap = new Map<string, typeof cartItems>();
      for (const item of cartItems) {
        const gid = item?.product?.sellerId || user?.uid || 'agrimarche-official';
        if (!groupsMap.has(gid)) groupsMap.set(gid, []);
        groupsMap.get(gid)!.push(item);
      }
      const sellerGroups = [...groupsMap.entries()];
      const isMultiVendor = sellerGroups.length > 1;
      const orderGroupId = generateOrderNumber();
      const createdOrders: { docRefId: string; orderNumber: string; deliveryFee: number; remainingAmount: number }[] = [];

      for (let i = 0; i < sellerGroups.length; i++) {
        const [groupSellerId, items] = sellerGroups[i];
        const firstItem = items[0];
        const orderNumber = isMultiVendor ? `${orderGroupId}-${String.fromCharCode(65 + i)}` : orderGroupId;
        const safeSellerId = groupSellerId || user?.uid || 'agrimarche-official';
        // Nom du vendeur : UNIQUEMENT le vrai nom du vendeur (jamais le nom de
        // la plateforme). D'abord le nom porté par le produit, sinon le
        // displayName du compte vendeur (lu plus bas), sinon vide — les écrans
        // affichent alors 'Vendeur' / '—'.
        const PLATFORM_NAMES = ['Sunu Mëñëf', 'SunuMëñëf', 'AgriMarché'];
        const productSellerName = [firstItem?.product?.sellerName, firstItem?.product?.farmer]
          .find((n): n is string => typeof n === 'string' && !!n.trim() && !PLATFORM_NAMES.includes(n.trim()));
        let safeSellerName = productSellerName?.trim() || '';
        const safeSellerPhone = firstItem?.product?.sellerPhone || '221779747073';
        const safeSellerRegion = firstItem?.product?.region || 'Dakar';
        // Point de retrait : cache des documents produits, sinon relecture
        // directe (cas du retour Wave, où la page vient d'être rechargée).
        let sellerPoint: SellerPoint | null = sellerPoints[safeSellerId] || null;
        if (!sellerPoint) {
          for (const it of items.slice(0, 3)) {
            const pid = it?.product?.id;
            if (!pid) continue;
            try {
              const snap = await getDoc(doc(db, 'products', pid));
              sellerPoint = sellerPointFromProduct(snap.data());
              if (sellerPoint) break;
            } catch { /* suivant */ }
          }
        }

        // Sous-total propre à ce vendeur, puis frais de livraison au
        // prorata de son poids dans le panier total. Le dernier groupe
        // récupère le reste de l'arrondi pour que la somme des frais de
        // livraison des sous-commandes soit TOUJOURS égale au deliveryFee
        // affiché au client au moment du paiement (jamais de FCFA perdu ou
        // ajouté par l'arrondi).
        const sellerSubtotal = items.reduce((sum, item) => sum + (item?.product?.price || 0) * (item?.quantity || 1), 0);
        const isLastGroup = i === sellerGroups.length - 1;
        let sellerDeliveryFee: number;
        if (!isMultiVendor) {
          sellerDeliveryFee = deliveryFee;
        } else if (isLastGroup) {
          sellerDeliveryFee = deliveryFee - createdOrders.reduce((s, o) => s + o.deliveryFee, 0);
        } else {
          const proportion = subtotal > 0 ? sellerSubtotal / subtotal : 1 / sellerGroups.length;
          sellerDeliveryFee = Math.round(deliveryFee * proportion);
        }
        const sellerTotal = sellerSubtotal + sellerDeliveryFee;
        const sellerDepositAmount = Math.round(sellerTotal * DEPOSIT_RATE * DEPOSIT_SURCHARGE);
        const sellerRemainingAmount = sellerTotal - sellerDepositAmount;

        const selectedMethod = PAYMENT_METHODS_CONFIG[selectedPaymentMethod as keyof typeof PAYMENT_METHODS_CONFIG];
        const newOrder = {
          // 🔒 FIX RACINE : PAS de champ `id` ici. Il dupliquait exactement
          // `orderNumber` (écrit juste après via updateDoc) et n'avait aucune
          // utilité propre — mais sa seule présence dans le document faisait
          // que TOUT code lisant la commande via `{ id: d.id, ...d.data() }`
          // voyait son vrai ID Firestore silencieusement écrasé par ce champ
          // `id` stocké (le numéro de commande lisible, ex: "AGR-20260723-1760"),
          // dès que le spread suivait `id: d.id` dans l'objet. Résultat concret :
          // les liens "Donner mon avis" pointaient vers un ID qui n'existe nulle
          // part dans Firestore → "Commande introuvable." Ce champ était un
          // pur piège, sans bénéfice : `orderNumber` fait exactement ce qu'il
          // faisait, sous un nom qui ne peut entrer en collision avec rien.
          sellerId: safeSellerId, sellerName: safeSellerName,
          sellerPhone: safeSellerPhone, sellerRegion: safeSellerRegion,
          userId: user.uid, userName: user?.displayName || guestName || 'Client Sunu Mëñëf',
          userEmail: user?.email || '', userPhone: profile?.phone || guestPhone || (user as any)?.phoneNumber || '',
          // 🔐 Sert exclusivement au parcours invité (findGuestOrders) : permet
          // de retrouver cette commande par téléphone sans compte ni SMS. Vide
          // pour un compte normal (non nécessaire, userId suffit déjà).
          ...(((profile as any)?.isGuest || (guestPhone && !profile)) ? { guestPhone: guestPhone.replace(/[^\d+]/g, '') } : {}),
          sellerLocation: sellerPoint
            ? {
                lat: sellerPoint.lat, lng: sellerPoint.lng, address: sellerPoint.address, isDefault: false,
                ...(sellerPoint.source ? { locationSource: sellerPoint.source } : {}),
                ...(typeof sellerPoint.accuracy === 'number' ? { accuracy: sellerPoint.accuracy } : {}),
                ...(sellerPoint.updatedAt ? { locationUpdatedAt: sellerPoint.updatedAt } : {}),
              }
            : { lat: DAKAR_CENTER.lat, lng: DAKAR_CENTER.lng, address: 'Point de retrait non renseigné', isDefault: true },
          // 🐛 FIX : isDefault (posé par useUserLocation.ts) est propagé ici —
          // avant, on écrivait lat/lng sans jamais dire si c'était une vraie
          // position ou le repli Dakar, donc impossible de le savoir plus tard
          // côté livreur.
          customerLocation: {
            lat: orderDeliveryPoint.lat,
            lng: orderDeliveryPoint.lng,
            address: orderDeliveryPoint.address,
            isDefault: false,
            source: orderDeliveryPoint.source,
            ...(typeof orderDeliveryPoint.accuracy === 'number' ? { accuracy: Math.round(orderDeliveryPoint.accuracy) } : {}),
            ...(orderDeliveryPoint.instructions ? { instructions: orderDeliveryPoint.instructions } : {}),
          },
          locationSource: orderDeliveryPoint.source,
          ...(deliveryDistanceKm !== null ? { deliveryDistanceKm: Math.round(deliveryDistanceKm * 10) / 10 } : {}),
          date: new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }),
          timestamp: new Date().toISOString(), status: 'en_attente', statusLabel: "En attente de validation - Acompte à vérifier",
          orderGroupId, isMultiVendorGroup: isMultiVendor,
          subtotal: sellerSubtotal, deliveryFee: sellerDeliveryFee, isFreeDelivery, total: sellerTotal,
          depositRate: DEPOSIT_RATE, depositAmount: sellerDepositAmount, remainingAmount: sellerRemainingAmount,
          balanceDueAtDelivery: sellerRemainingAmount,
          paymentMethod: selectedPaymentMethod, paymentMethodName: selectedMethod?.name,
          paymentStatus: 'acompte_en_attente_verification',
          items: items.map(item => ({
            productId: item?.product?.id || 'unknown', productName: item?.product?.name || 'Produit inconnu',
            productPrice: item?.product?.price || 0, quantity: item?.quantity || 1,
            unit: item?.product?.unit || 'kg', total: (item?.product?.price || 0) * (item?.quantity || 1),
            image: item?.product?.images?.[0] || null, category: item?.product?.category || 'Autres',
          })),
          // Timestamp Firestore (pas une string ISO) : account-page.tsx compare
          // via `updatedAt?.seconds` pour garder la copie la plus récente entre
          // orders et seller_orders. C'est la toute première écriture de chaque
          // commande — avant ce fix, ce bug touchait donc 100% des commandes.
          deliveryTime: estimatedDelivery, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
        };
        const docRef = await addDoc(collection(db, 'orders'), newOrder);
        // Mettre à jour le doc avec son propre ID Firestore pour faciliter les requêtes croisées
        await updateDoc(doc(db, 'orders', docRef.id), {
          firestoreId: docRef.id,
          orderNumber,
          estimatedDelivery: Timestamp.fromDate(getEstimatedDeliveryDate(new Date())),
        });
        await initDeliveryTracking(docRef.id);

        // Notifier le vendeur dans seller_orders
        // ✅ FIX : setDoc avec docRef.id (même ID que "orders") au lieu de
        // addDoc (qui générait un ID aléatoire différent). Sans ça, account/page.tsx,
        // account/orders/page.tsx et seller/orders/page.tsx référencent
        // doc(db,'seller_orders', id) avec l'ID de la commande "orders" — un
        // document qui n'a jamais existé — donc leurs mises à jour de statut
        // (annulation, confirmation de livraison...) sur seller_orders étaient
        // silencieusement ignorées (sellerOrderSnap.exists() === false), et le
        // doc créé ici restait figé pour toujours à status: 'en_attente'.
        try {
          await setDoc(doc(db, 'seller_orders', docRef.id), {
            ...newOrder,
            orderId: docRef.id,
            orderNumber,
            firestoreId: docRef.id,
            sellerRead: false,
            sellerStatus: 'nouvelle',  // statut interne vendeur (lecture seule)
            notifiedAt: Timestamp.now(),
          });
        } catch (e) { console.error('seller_orders', e); }

        // Notifier le vendeur : nouvelle commande. Best-effort (voir notifyUser),
        // ne bloque jamais la confirmation de commande côté acheteur si ça échoue.
        if (safeSellerId && safeSellerId !== 'agrimarche-official') {
          notifyUser({
            userId: safeSellerId,
            type: 'order',
            title: '🛒 Nouvelle commande !',
            body: `${user?.displayName || 'Un client'} vient de commander · ${sellerTotal.toLocaleString('fr-FR')} FCFA`,
            link: '/seller/orders',
            priority: 'high',
          });
        }

        // ⚠️ Le stock a déjà été vérifié + décrémenté atomiquement plus haut,
        // avant que la moindre commande ne soit créée (voir transaction en
        // début de fonction) — rien à refaire ici.

        createdOrders.push({ docRefId: docRef.id, orderNumber, deliveryFee: sellerDeliveryFee, remainingAmount: sellerRemainingAmount });
      }

      // ✅ NOUVEAU : recopie la position de livraison sur le profil du client
      // (users/{uid}.lat/lng), en plus de celle déjà stockée sur chaque
      // commande. Avant, un client n'était géolocalisable QUE via une
      // commande active — invisible sur la carte admin "Tous les
      // utilisateurs" en dehors de ça. Best-effort : ne doit jamais faire
      // échouer le checkout si l'écriture échoue (compte invité, règles
      // Firestore, etc.).
      // Adresse confirmée gardée pour la prochaine commande. Pour un vendeur
      // qui achète, elle ne touche PAS à son point de retrait (voir userLocation.ts).
      if (user?.uid && !(profile as any)?.isGuest) {
        saveDeliveryAddress(user.uid, orderDeliveryPoint, (profile as any)?.role)
          .then(() => patchLocalProfile?.({ deliveryLocation: { ...orderDeliveryPoint, updatedAt: Date.now() } }))
          .catch(() => {});
      }
      try { sessionStorage.removeItem(DELIVERY_POINT_KEY); } catch { /* ignore */ }

      // ✅ Relances "commandes en attente" + "clients inactifs" : pas de
      // cron, on profite du trafic organique (chaque checkout) pour
      // vérifier s'il est temps de relancer. Auto-throttlé côté serveur
      // (voir /api/system/periodic-checks) : ne coûte quasi rien tant que
      // le dernier scan est récent. Fire-and-forget, ne doit jamais
      // ralentir ni faire échouer le checkout.
      fetch(apiUrl('/api/system/periodic-checks'), { method: 'POST' }).catch(() => {});

      // Vider panier + succes
      clearCart();
      setOrderId(isMultiVendor ? orderGroupId : createdOrders[0].orderNumber);
      setOrderBalance(createdOrders.reduce((sum, o) => sum + o.remainingAmount, 0));
      setIsMultiVendorOrder(isMultiVendor);
      setSuccess(true);

      // SMS de confirmation de commande au client (best-effort, via Infobip —
      // voir /api/send-sms). Ne bloque jamais le flow : le client a déjà sa
      // confirmation à l'écran, l'échec du SMS ne doit pas gâcher ça.
      if (profile?.phone) {
        const totalAmount = createdOrders.reduce((sum, o) => sum + o.deliveryFee + o.remainingAmount, 0);
        const label = isMultiVendor ? orderGroupId : createdOrders[0].orderNumber;
        fetch(apiUrl('/api/send-sms'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: profile.phone,
            message: `Sunu Mëñëf : commande #${label} confirmée. Total ${totalAmount.toLocaleString('fr-FR')} FCFA. Merci de votre confiance !`,
          }),
        }).catch((e) => console.warn('[checkout] SMS confirmation non envoyé:', e));
      }

      // Rediriger vers la commande spécifique (mono-vendeur) ou vers la liste
      // complète des commandes (multi-vendeur, plusieurs docs créés)
      setTimeout(() => {
        router.push(isMultiVendor ? '/account/orders' : '/account/orders?order=' + createdOrders[0].docRefId);
      }, 3000);
      return true;
    } catch (err) {
      console.error(err); setOrderError('Une erreur est survenue. Veuillez réessayer.'); return false;
    } finally { setIsProcessing(false); }
  };

  const handlePaymentConfirm = async () => {
    setShowPaymentModal(false);
    await createOrder();
  };

  // Retour depuis Wave: creer la commande automatiquement
  useEffect(() => {
    if (!waveReturn || cartItems.length === 0 || !user) return;
    setWaveReturn(false);
    createOrder();
  }, [waveReturn, cartItems.length, user]);

  const handleCheckout = async () => {
    // ✅ Avant : redirection forcée vers /auth/login, ce qui obligeait à
    // créer un compte (donc, dans ce projet, un OTP SMS) juste pour
    // commander. Désormais : un simple numéro de téléphone suffit — la
    // modal ci-dessous ouvre une session invité sans SMS ni mot de passe.
    if (!deliveryPoint) {
      setDeliveryError('Indiquez où vous livrer : position actuelle, recherche ou point sur la carte.');
      setEditingDelivery(true);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!user) { setShowGuestModal(true); return; }
    if (cartItems.length === 0) { setOrderError('Votre panier est vide'); return; }
    const method = PAYMENT_METHODS_CONFIG[selectedPaymentMethod as keyof typeof PAYMENT_METHODS_CONFIG];
    if (method) { setActivePaymentMethod(method); setShowPaymentModal(true); }
  };

  // Une fois la session invité active, `user` devient vrai via le
  // listener onAuthStateChanged (dans useAuth) — pas de façon synchrone
  // juste après signInWithCustomToken. On attend ce signal plutôt que de
  // parier sur un délai arbitraire avant d'ouvrir le paiement.
  useEffect(() => {
    if (user && pendingGuestCheckoutRef.current) {
      pendingGuestCheckoutRef.current = false;
      const method = PAYMENT_METHODS_CONFIG[selectedPaymentMethod as keyof typeof PAYMENT_METHODS_CONFIG];
      if (method) { setActivePaymentMethod(method); setShowPaymentModal(true); }
    }
  }, [user, selectedPaymentMethod]);

  const handleGuestContinue = async () => {
    if (guestPhone.trim().replace(/\D/g, '').length < 8) {
      setGuestError('Entrez un numéro de téléphone valide.');
      return;
    }
    setGuestSubmitting(true);
    setGuestError('');
    try {
      await startGuestCheckoutSession(guestPhone, guestName.trim() || undefined);
      pendingGuestCheckoutRef.current = true;
      setShowGuestModal(false);
    } catch (e) {
      setGuestError(e instanceof DeliveryCodeError ? e.message : 'Erreur de connexion, réessayez.');
    } finally {
      setGuestSubmitting(false);
    }
  };

  /* -- Traitement retour Wave -- */
  if (isProcessing || waveReturn) return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div className="success-root checkout-root">
        <div className="success-card">
          <div style={{ width:60, height:60, borderRadius:'50%', border:'4px solid var(--gold)', borderTopColor:'transparent', animation:'spin 0.8s linear infinite', margin:'0 auto 24px' }} />
          <p className="serif" style={{ fontSize:26, fontWeight:300, color:'var(--ink)', textAlign:'center' }}>Traitement en cours\u2026</p>
          <p style={{ fontSize:13, color:'var(--ink-lt)', textAlign:'center', marginTop:8 }}>Votre commande est en cours de confirmation.</p>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );

  /* -- Success screen -- */
  if (success) return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div className="success-root checkout-root">
        <div className="success-card animate-enter">
          <div className="success-icon-ring">
            <CheckCircle size={36} style={{ color:'var(--gold)' }} />
          </div>
          <p className="serif" style={{ fontSize:32, fontWeight:300, color:'var(--ink)', lineHeight:1.2 }}>Commande<br /><em>confirmée</em></p>
          <p style={{ fontSize:13, color:'var(--ink-lt)', marginTop:8 }}>Merci pour votre confiance</p>
          <div className="success-order-badge">{orderId}</div>
          {isMultiVendorOrder && (
            <p style={{ fontSize:12, color:'var(--ink-lt)', marginTop:-16, marginBottom:16 }}>
              Votre panier contenait des produits de plusieurs vendeurs — il a été scindé en plusieurs livraisons, visibles séparément dans « Mes commandes ».
            </p>
          )}

          <div style={{ background:'var(--ivory)', borderRadius:16, padding:'16px 20px', border:'1px solid var(--border)', textAlign:'left', marginBottom:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <Truck size={14} style={{ color:'var(--gold)' }} />
              <span style={{ fontSize:11, fontWeight:500, letterSpacing:'0.10em', textTransform:'uppercase', color:'var(--ink-md)' }}>Livraison estimée</span>
            </div>
            <p style={{ fontSize:15, color:'var(--ink)', fontWeight:400 }}>{estimatedDelivery}</p>
            {isFreeDelivery && (
              <span className="tag tag-green" style={{ marginTop:8 }}><Gift size={10} /> Livraison offerte</span>
            )}
          </div>

          <div style={{ background:'linear-gradient(135deg, #FFFDF9, #FDF5E4)', borderRadius:16, padding:'16px 20px', border:'1.5px solid var(--gold-lt)', textAlign:'left', marginBottom:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <Banknote size={14} style={{ color:'var(--gold)' }} />
              <span style={{ fontSize:11, fontWeight:500, letterSpacing:'0.10em', textTransform:'uppercase', color:'var(--ink-md)' }}>Solde à régler à la livraison</span>
            </div>
            <p style={{ fontSize:18, color:'var(--ink)', fontWeight:600 }}>{orderBalance.toLocaleString()} <span style={{ fontSize:13, fontWeight:400, color:'var(--ink-lt)' }}>FCFA</span></p>
            <p style={{ fontSize:12, color:'var(--ink-lt)', marginTop:4 }}>Acompte de 25% déjà réglé. Le solde est à remettre au livreur.</p>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <Link href="/account/orders" className="cta-btn" style={{ textDecoration:'none', borderRadius:14 }}>
              Mes commandes
            </Link>
            <Link href="/main/products" style={{ textDecoration:'none', textAlign:'center', fontSize:12, color:'var(--ink-lt)', letterSpacing:'0.08em', textTransform:'uppercase', padding:'12px', display:'block' }}>
              Continuer mes achats
            </Link>
          </div>
        </div>
      </div>
    </>
  );

  /* ── Main checkout ── */
  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div className="checkout-root">
        <div style={{ maxWidth:1160, margin:'0 auto', padding:'40px 20px' }}>

          {/* Top nav */}
          <div className="animate-enter" style={{ display:'flex', alignItems:'center', gap:16, marginBottom:40 }}>
            <button onClick={() => router.back()} style={{ width:40, height:40, borderRadius:'50%', border:'1px solid var(--border)', background:'var(--white)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink-md)', flexShrink:0, transition:'all 0.2s' }}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <p style={{ fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--ink-lt)', marginBottom:2 }}>Sunu Mëñëf</p>
              <h1 className="serif" style={{ fontSize:28, fontWeight:400, color:'var(--ink)', lineHeight:1 }}>Validation de commande</h1>
            </div>
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
              <Lock size={12} style={{ color:'var(--gold)' }} />
              <span style={{ fontSize:11, color:'var(--ink-lt)', letterSpacing:'0.06em' }}>Paiement sécurisé</span>
            </div>
          </div>

          {/* Grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:28 }} className="checkout-grid">
            <style>{`@media(min-width:1024px){.checkout-grid{grid-template-columns:1fr 400px !important;}}`}</style>

            {/* LEFT */}
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

              {/* Delivery */}
              <div className="card animate-enter delay-1">
                <div className="card-header">
                  <div className="card-header-dot" />
                  <Truck size={14} style={{ color:'var(--ink-lt)' }} />
                  <span className="card-header-title">Adresse de livraison</span>
                </div>
                <div className="card-body">
                  {deliveryPoint && !editingDelivery ? (
                    <div style={{ padding:'12px 16px', background:'rgba(16,185,129,.08)', borderRadius:10, border:'1px solid rgba(16,185,129,.3)' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                        <MapPin size={16} style={{ color:'#059669', flexShrink:0, marginTop:2 }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:14, fontWeight:600, color:'var(--ink)' }}>{deliveryPoint.address}</p>
                          <p style={{ fontSize:11.5, color:'var(--ink-lt)', marginTop:2 }}>
                            {deliveryPoint.source === 'GPS' && typeof deliveryPoint.accuracy === 'number'
                              ? `Position GPS (±${Math.round(deliveryPoint.accuracy)} m)`
                              : deliveryPoint.source === 'MAP_SEARCH' ? 'Lieu choisi par la recherche' : 'Point placé sur la carte'}
                            {deliveryDistanceKm !== null && ` · ~${Math.round(deliveryDistanceKm)} km du vendeur`}
                          </p>
                          {deliveryPoint.instructions && (
                            <p style={{ fontSize:12, color:'var(--ink-md)', marginTop:4 }}>📝 {deliveryPoint.instructions}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingDelivery(true)}
                          style={{ fontSize:12, fontWeight:600, color:'#059669', background:'none', border:'none', cursor:'pointer', flexShrink:0 }}
                        >
                          Modifier
                        </button>
                      </div>
                    </div>
                  ) : (
                    <LocationEditor
                      initial={deliveryPoint}
                      withInstructions
                      helper="Où voulez-vous être livré ? Le livreur ira exactement à ce point."
                      confirmLabel="Livrer ici"
                      onCancel={deliveryPoint ? () => setEditingDelivery(false) : undefined}
                      onConfirm={(rec) => {
                        setDeliveryPoint(rec);
                        setEditingDelivery(false);
                        setDeliveryError('');
                      }}
                    />
                  )}
                  {deliveryError && (
                    <div style={{ marginTop:10, display:'flex', alignItems:'flex-start', gap:6, color:'#b45309', fontSize:12 }}>
                      <AlertCircle size={13} style={{ flexShrink:0, marginTop:1 }} /> {deliveryError}
                    </div>
                  )}
                </div>
              </div>

              {/* Contact */}
              <div className="card animate-enter delay-2">
                <div className="card-header">
                  <div className="card-header-dot" />
                  <User size={14} style={{ color:'var(--ink-lt)' }} />
                  <span className="card-header-title">Informations de contact</span>
                </div>
                <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { icon: <User size={15} />, label:'Nom complet', value: user?.displayName || 'Client Sunu Mëñëf' },
                    { icon: <Mail size={15} />, label:'Adresse e-mail', value: user?.email || 'Non renseigné' },
                    { icon: <Phone size={15} />, label:'Téléphone', value: (user as any)?.phoneNumber || 'À renseigner' },
                  ].map((row) => (
                    <div key={row.label} className="info-row">
                      <div className="icon-circle" style={{ width:34, height:34 }}>{row.icon}</div>
                      <div>
                        <p className="info-row-label">{row.label}</p>
                        <p className="info-row-value">{row.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment */}
              <div className="card animate-enter delay-3">
                <div className="card-header">
                  <div className="card-header-dot" />
                  <CreditCard size={14} style={{ color:'var(--ink-lt)' }} />
                  <span className="card-header-title">Moyen de paiement</span>
                </div>
                <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {Object.values(PAYMENT_METHODS_CONFIG).map((method) => (
                    <label
                      key={method.id}
                      className={`pay-option${selectedPaymentMethod === method.id ? ' selected' : ''}`}
                      onClick={() => setSelectedPaymentMethod(method.id)}
                    >
                      <input type="radio" name="paymentMethod" value={method.id} readOnly checked={selectedPaymentMethod === method.id} />
                      <div className="pay-radio"><div className="pay-radio-dot" /></div>
                      <div className="icon-circle" style={{ width:36, height:36 }}>{method.icon}</div>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:14, fontWeight:500, color:'var(--ink)', marginBottom:2 }}>{method.name}</p>
                        <p style={{ fontSize:12, color:'var(--ink-lt)' }}>{method.description}</p>
                      </div>
                      {selectedPaymentMethod === method.id && (
                        <span className="tag tag-gold"><Check size={10} /> Sélectionné</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT — Summary */}
            <div style={{ position:'sticky', top:24, alignSelf:'start' }} className="animate-enter delay-4">
              <div className="card">
                <div style={{ background:'var(--ink)', padding:'20px 28px', display:'flex', alignItems:'center', gap:10 }}>
                  <ShoppingBag size={16} style={{ color:'var(--gold)' }} />
                  <span className="serif" style={{ fontSize:18, fontWeight:400, color:'var(--white)', letterSpacing:'0.02em' }}>Récapitulatif</span>
                  <span style={{ marginLeft:'auto', fontSize:12, color:'rgba(255,255,255,0.4)', letterSpacing:'0.06em' }}>{cartItems.length} article{cartItems.length > 1 ? 's' : ''}</span>
                </div>

                <div className="card-body">
                  <div style={{ maxHeight:280, overflowY:'auto', marginBottom:16 }}>
                    {cartItems.map((item: any, idx: number) => (
                      <div key={idx} className="cart-item">
                        <div className="cart-thumb">
                          <Leaf size={18} style={{ color:'#2D7A4E' }} />
                        </div>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:13, fontWeight:500, color:'var(--ink)', marginBottom:2 }}>{item?.product?.name}</p>
                          <p style={{ fontSize:11, color:'var(--ink-lt)' }}>{item?.quantity} × {(item?.product?.price || 0).toLocaleString()} FCFA</p>
                        </div>
                        <p style={{ fontSize:13, fontWeight:600, color:'var(--ink)', flexShrink:0 }}>
                          {((item?.product?.price || 0) * (item?.quantity || 0)).toLocaleString()} <span style={{ fontSize:10, color:'var(--ink-lt)' }}>FCFA</span>
                        </p>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div className="total-row">
                      <span style={{ color:'var(--ink-lt)', fontSize:13 }}>Sous-total</span>
                      <span style={{ fontSize:13, color:'var(--ink)' }}>{subtotal.toLocaleString()} FCFA</span>
                    </div>
                    <div className="total-row">
                      <span style={{ color:'var(--ink-lt)', fontSize:13 }}>Livraison</span>
                      <span style={{ fontSize:13, color: isFreeDelivery ? '#1E7A44' : 'var(--ink)' }}>
                        {isFreeDelivery ? 'Offerte' : `${deliveryFee.toLocaleString()} FCFA`}
                      </span>
                    </div>
                    {isFreeDelivery && (
                      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:'#F0FAF4', borderRadius:8, border:'1px solid #A8E6C0' }}>
                        <Gift size={12} style={{ color:'#1E7A44' }} />
                        <span style={{ fontSize:11, color:'#1E7A44', letterSpacing:'0.04em' }}>Livraison offerte dès 5 000 FCFA</span>
                      </div>
                    )}
                    <div className="total-row grand">
                      <span style={{ fontSize:14, fontWeight:500, color:'var(--ink)', letterSpacing:'0.04em' }}>Total TTC</span>
                      <span className="serif" style={{ fontSize:24, fontWeight:500, color:'var(--ink)' }}>{total.toLocaleString()} <span style={{ fontSize:14, fontWeight:400 }}>FCFA</span></span>
                    </div>
                  </div>

                  <div style={{ marginTop:16, padding:'16px 18px', background:'linear-gradient(135deg, #FFFDF9, #FDF5E4)', borderRadius:14, border:'1.5px solid var(--gold-lt)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                      <Receipt size={14} style={{ color:'var(--gold)' }} />
                      <span style={{ fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--ink-md)' }}>Paiement en 2 fois</span>
                    </div>
                    <div className="total-row" style={{ marginBottom:6 }}>
                      <span style={{ color:'var(--ink)', fontSize:13, fontWeight:500 }}>Acompte à régler maintenant (25%)</span>
                      <span style={{ fontSize:15, color:'var(--gold)', fontWeight:700 }}>{depositAmount.toLocaleString()} FCFA</span>
                    </div>
                    <div className="total-row">
                      <span style={{ color:'var(--ink-lt)', fontSize:12 }}>Solde à régler à la livraison (75%)</span>
                      <span style={{ fontSize:13, color:'var(--ink-md)' }}>{remainingAmount.toLocaleString()} FCFA</span>
                    </div>
                  </div>

                  <div style={{ marginTop:16, padding:'12px 16px', background:'var(--ivory)', borderRadius:12, border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                    <Truck size={14} style={{ color:'var(--gold)', flexShrink:0 }} />
                    <div>
                      <p style={{ fontSize:11, color:'var(--ink-lt)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:2 }}>Livraison estimée</p>
                      <p style={{ fontSize:13, color:'var(--ink)', fontWeight:500 }}>{estimatedDelivery}</p>
                    </div>
                  </div>

                  {orderError && (
                    <div className="err-box" style={{ marginTop:14 }}>
                      <AlertCircle size={14} />{orderError}
                    </div>
                  )}

                  <button onClick={handleCheckout} disabled={isProcessing || cartItems.length === 0} className="cta-btn" style={{ marginTop:20 }}>
                    {isProcessing
                      ? <><Loader2 size={16} style={{ animation:'spin 1s linear infinite' }} /> Traitement…</>
                      : <>Payer l'acompte · {depositAmount.toLocaleString()} FCFA →</>}
                  </button>

                  <div style={{ marginTop:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    <Lock size={11} style={{ color:'var(--ink-lt)' }} />
                    <span style={{ fontSize:11, color:'var(--ink-lt)', letterSpacing:'0.06em' }}>Paiement 100% sécurisé · Livraison garantie</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal simplifié */}
      {showPaymentModal && activePaymentMethod && (
        <div className="modal-overlay">
          <PaymentModal
            method={activePaymentMethod}
            amount={depositAmount}
            remainingAmount={remainingAmount}
            onConfirm={handlePaymentConfirm}
            onBack={() => setShowPaymentModal(false)}
          />
        </div>
      )}

      {showGuestModal && (
        <div className="modal-overlay">
          <GuestCheckoutModal
            phone={guestPhone} setPhone={setGuestPhone}
            name={guestName} setName={setGuestName}
            error={guestError} submitting={guestSubmitting}
            onContinue={handleGuestContinue}
            onCreateAccount={() => { setShowGuestModal(false); router.push('/auth/register?redirect=/checkout'); }}
            onLogin={() => { setShowGuestModal(false); router.push('/auth/login?redirect=/checkout'); }}
            onClose={() => setShowGuestModal(false)}
          />
        </div>
      )}
    </>
  );
}
