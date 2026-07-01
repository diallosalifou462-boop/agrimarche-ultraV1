'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { useUserLocation } from '@/hooks/useUserLocation';
import {
  collection, addDoc, Timestamp, doc, updateDoc, increment, getDoc,
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
  const { user } = useAuth();
  const { cart, clearCart } = useCart() as { cart: { items: any[]; total: number; itemCount: number }; clearCart: () => void };
  const { location, loading: locationLoading, detectLocation } = useUserLocation();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [orderBalance, setOrderBalance] = useState(0);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('wave');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activePaymentMethod, setActivePaymentMethod] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [waveReturn, setWaveReturn] = useState(false);

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

  const deliveryFee = useMemo(() => {
    if (isFreeDelivery) return 0;
    if (!location?.lat || !location?.lng) return 1000;
    const dist = Math.sqrt(Math.pow(location.lat - 14.7167, 2) + Math.pow(location.lng + 17.4677, 2)) * 111;
    if (dist <= 10) return 500;
    if (dist <= 30) return 1000;
    if (dist <= 100) return 1500;
    return 2000;
  }, [location, isFreeDelivery]);

  const total = subtotal + deliveryFee;
  const depositAmount = Math.round(total * DEPOSIT_RATE);
  const remainingAmount = total - depositAmount;

  const estimatedDelivery = useMemo(() => {
    if (isFreeDelivery) return '24 – 48 h (Express)';
    if (!location?.lat || !location?.lng) return 'À confirmer';
    const dist = Math.sqrt(Math.pow(location.lat - 14.7167, 2) + Math.pow(location.lng + 17.4677, 2)) * 111;
    if (dist <= 10) return '24 h';
    if (dist <= 30) return '24 – 48 h';
    if (dist <= 100) return '48 – 72 h';
    return '3 – 5 jours';
  }, [location, isFreeDelivery]);

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
    setIsProcessing(true); setOrderError('');
    try {
      const firstItem = cartItems[0];
      const orderNumber = generateOrderNumber();
      const safeSellerId = firstItem?.product?.sellerId || user?.uid || 'agrimarche-official';
      const safeSellerName = firstItem?.product?.sellerName || 'AgriMarché';
      const safeSellerPhone = firstItem?.product?.sellerPhone || '221779747073';
      const safeSellerRegion = firstItem?.product?.region || 'Dakar, Sénégal';
      let sellerLat = 14.7167; let sellerLng = -17.4677; let sellerAddress = 'Dakar, Sénégal';
      if (safeSellerId && safeSellerId !== 'agrimarche-official') {
        try {
          const sellerDoc = await getDoc(doc(db, 'users', safeSellerId));
          if (sellerDoc.exists()) {
            const d = sellerDoc.data();
            sellerLat = d?.latitude || d?.lat || 14.7167;
            sellerLng = d?.longitude || d?.lng || -17.4677;
            sellerAddress = d?.address || d?.city || 'Dakar, Sénégal';
          }
        } catch {}
      }
      const selectedMethod = PAYMENT_METHODS_CONFIG[selectedPaymentMethod as keyof typeof PAYMENT_METHODS_CONFIG];
      const newOrder = {
        id: orderNumber, sellerId: safeSellerId, sellerName: safeSellerName,
        sellerPhone: safeSellerPhone, sellerRegion: safeSellerRegion,
        userId: user?.uid || 'guest-user', userName: user?.displayName || 'Client AgriMarché',
        userEmail: user?.email || '', userPhone: (user as any)?.phoneNumber || '',
        sellerLocation: { lat: sellerLat, lng: sellerLng, address: sellerAddress },
        customerLocation: { lat: location?.lat || null, lng: location?.lng || null, address: location?.address || location?.city || 'Adresse non détectée' },
        date: new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }),
        timestamp: new Date().toISOString(), status: 'en_attente', statusLabel: "En attente de validation - Acompte à vérifier",
        subtotal, deliveryFee, isFreeDelivery, total,
        depositRate: DEPOSIT_RATE, depositAmount, remainingAmount,
        balanceDueAtDelivery: remainingAmount,
        paymentMethod: selectedPaymentMethod, paymentMethodName: selectedMethod?.name,
        paymentStatus: 'acompte_en_attente_verification',
        items: cartItems.map(item => ({
          productId: item?.product?.id || 'unknown', productName: item?.product?.name || 'Produit inconnu',
          productPrice: item?.product?.price || 0, quantity: item?.quantity || 1,
          unit: item?.product?.unit || 'kg', total: (item?.product?.price || 0) * (item?.quantity || 1),
          image: item?.product?.images?.[0] || null, category: item?.product?.category || 'Autres',
        })),
        deliveryTime: estimatedDelivery, createdAt: Timestamp.now(), updatedAt: new Date().toISOString(),
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
      try {
        await addDoc(collection(db, 'seller_orders'), {
          ...newOrder,
          orderId: docRef.id,
          orderNumber,
          firestoreId: docRef.id,
          sellerRead: false,
          sellerStatus: 'nouvelle',  // statut interne vendeur (lecture seule)
          notifiedAt: Timestamp.now(),
        });
      } catch (e) { console.error('seller_orders', e); }

      // Decrementer stock
      for (const item of cartItems) {
        if (item?.product?.id) {
          try { await updateDoc(doc(db, 'products', item.product.id), { stock: increment(-(item.quantity || 1)) }); } catch {}
        }
      }

      // Vider panier + succes
      clearCart();
      setOrderId(orderNumber);
      setOrderBalance(remainingAmount);
      setSuccess(true);
      // Rediriger vers la commande spécifique dans orders-page (docRef.id = ID Firestore)
      setTimeout(() => router.push('/account/orders?order=' + docRef.id), 3000);
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
    if (!user) { router.push('/auth/login?redirect=/checkout'); return; }
    if (cartItems.length === 0) { setOrderError('Votre panier est vide'); return; }
    const method = PAYMENT_METHODS_CONFIG[selectedPaymentMethod as keyof typeof PAYMENT_METHODS_CONFIG];
    if (method) { setActivePaymentMethod(method); setShowPaymentModal(true); }
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
              <p style={{ fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--ink-lt)', marginBottom:2 }}>AgriMarché</p>
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
                  <button className="location-btn" onClick={detectLocation}>
                    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                      <div className="icon-circle"><Navigation size={16} /></div>
                      <div style={{ textAlign:'left' }}>
                        <p style={{ fontSize:14, fontWeight:500, color:'var(--ink)', marginBottom:2 }}>Utiliser ma position GPS</p>
                        {locationLoading
                          ? <p style={{ fontSize:12, color:'var(--ink-lt)' }}>Détection en cours…</p>
                          : location?.city
                            ? <p style={{ fontSize:12, color:'var(--gold)' }}>{location.city}{location.region ? `, ${location.region}` : ''}</p>
                            : <p style={{ fontSize:12, color:'var(--ink-lt)' }}>Cliquez pour détecter automatiquement</p>}
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color:'var(--gold)', flexShrink:0 }} />
                  </button>
                  {location?.address && (
                    <div style={{ marginTop:12, padding:'12px 16px', background:'var(--ivory)', borderRadius:10, border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
                      <MapPin size={14} style={{ color:'var(--gold)', flexShrink:0 }} />
                      <span style={{ fontSize:13, color:'var(--ink-md)' }}>{location.address}</span>
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
                    { icon: <User size={15} />, label:'Nom complet', value: user?.displayName || 'Client AgriMarché' },
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
    </>
  );
}
