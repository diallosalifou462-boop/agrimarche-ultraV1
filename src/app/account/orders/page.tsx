'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  collection, query, where, orderBy, onSnapshot, doc, updateDoc, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Suspense } from 'react';

interface Order {
  id: string;
  orderNumber: string;
  // ─── STATUTS UNIFIÉS (identiques à page.tsx et checkout-page.tsx) ───────────
  // en_attente → en_preparation → en_livraison → livre
  //                                            ↘ annule (cancelledBy: 'client'|'seller')
  status: string;
  statusLabel: string;
  total: number;
  depositAmount: number;
  remainingAmount: number;
  paymentMethodName: string;
  items: { productName: string; quantity: number; unit: string; productPrice: number; image?: string }[];
  sellerName: string;
  sellerPhone: string;
  date: string;
  deliveryTime: string;
  createdAt: any;
  cancelledBy?: string;
  cancelledAt?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE DE VÉRITÉ : mêmes clés que page.tsx (vendeur) et checkout-page.tsx
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  en_attente:     { label: 'En attente',        color: '#92400e', bg: '#fef3c7', icon: '⏳' },
  en_preparation: { label: 'En préparation',    color: '#1e40af', bg: '#dbeafe', icon: '🔧' },
  en_livraison:   { label: 'En livraison',      color: '#5b21b6', bg: '#ede9fe', icon: '🚚' },
  livre:          { label: 'Livrée',            color: '#065f46', bg: '#d1fae5', icon: '📦' },
  annule:         { label: 'Annulée',           color: '#991b1b', bg: '#fee2e2', icon: '❌' },
};

// Étapes du tracking (dans l'ordre du flux)
const TRACKING_STEPS = [
  { key: 'en_attente',     icon: '⏳', label: 'Commande reçue',           doneWhen: (_s: string) => true },
  { key: 'en_preparation', icon: '🔧', label: 'Acceptée par le vendeur',   doneWhen: (s: string) => ['en_preparation','en_livraison','livre'].includes(s) },
  { key: 'en_livraison',   icon: '🚚', label: 'En cours de livraison',     doneWhen: (s: string) => ['en_livraison','livre'].includes(s) },
  { key: 'livre',          icon: '📦', label: 'Livrée',                    doneWhen: (s: string) => s === 'livre' },
];

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(searchParams.get('order'));
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/auth/login?redirect=/account/orders'); return; }

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(data);
      setLoading(false);
      if (!selected && data.length > 0) setSelected(data[0].id);
    });

    return () => unsub();
  }, [user, authLoading]);

  // ── Annulation par le client ─────────────────────────────────────────────
  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Annuler cette commande ? Cette action est irréversible.')) return;
    setCancelling(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'annule',
        statusLabel: 'Annulée par le client',
        cancelledBy: 'client',
        cancelledAt: Timestamp.now(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Erreur annulation', e);
      alert('Erreur lors de l\'annulation. Réessayez.');
    } finally {
      setCancelling(null);
    }
  };

  const selectedOrder = orders.find(o => o.id === selected);
  const status = selectedOrder ? (STATUS_CONFIG[selectedOrder.status] || STATUS_CONFIG.en_attente) : null;

  if (loading || authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF8' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #C9A96E', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (orders.length === 0) return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>📦</div>
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 300, color: '#1A1A1A', marginBottom: 8 }}>Aucune commande</h2>
      <p style={{ color: '#9A9A9A', fontSize: 14, marginBottom: 32 }}>Vous n'avez pas encore passé de commande.</p>
      <button
        onClick={() => router.push('/main/products')}
        style={{ background: 'linear-gradient(135deg, #C9A96E, #b8923a)', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 32px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
      >
        Découvrir les produits
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', fontFamily: 'DM Sans, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        .order-item { cursor:pointer; transition: all 0.2s; border-radius:16px; padding:16px; border:1.5px solid transparent; }
        .order-item:hover { background:#fff; border-color:rgba(201,169,110,0.3); }
        .order-item.active { background:#fff; border-color:#C9A96E; box-shadow:0 4px 24px rgba(201,169,110,0.15); }
        .wa-btn { display:flex; align-items:center; gap:8px; background:#25D366; color:#fff; border:none; border-radius:12px; padding:12px 20px; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; transition:opacity 0.2s; }
        .wa-btn:hover { opacity:0.88; }
        .track-step { display:flex; align-items:flex-start; gap:12px; padding:12px 0; }
        .track-dot { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:13px; margin-top:2px; }
        .cancel-btn { display:flex; align-items:center; gap:8px; background:#fff; color:#991b1b; border:1.5px solid #fca5a5; border-radius:12px; padding:11px 18px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .cancel-btn:hover { background:#fee2e2; }
        .cancel-btn:disabled { opacity:0.5; cursor:not-allowed; }
      `}</style>

      {/* Header */}
      <header style={{ position:'sticky', top:0, zIndex:50, background:'rgba(250,250,248,0.92)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(201,169,110,0.15)', padding:'16px 20px' }}>
        <div style={{ maxWidth:720, margin:'0 auto', display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => router.back()} style={{ width:38, height:38, borderRadius:'50%', background:'#fff', border:'1px solid rgba(201,169,110,0.2)', cursor:'pointer', fontSize:18 }}>←</button>
          <div>
            <h1 style={{ fontFamily:'Cormorant Garamond, Georgia, serif', fontSize:22, fontWeight:400, color:'#1A1A1A', margin:0 }}>Mes commandes</h1>
            <p style={{ fontSize:11, color:'#9A9A9A', margin:0, letterSpacing:'0.08em' }}>{orders.length} COMMANDE{orders.length > 1 ? 'S' : ''}</p>
          </div>
        </div>
      </header>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:12 }}>

        {orders.map(order => {
          const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.en_attente;
          const isActive = order.id === selected;
          // Le client peut annuler seulement si la commande n'est pas encore en livraison/livrée/déjà annulée
          const canCancel = ['en_attente', 'en_preparation'].includes(order.status);

          return (
            <div key={order.id} className={`order-item ${isActive ? 'active' : ''}`} onClick={() => setSelected(order.id)}
              style={{ animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', color:'#C9A96E' }}>
                      {order.orderNumber || order.id.slice(0,8).toUpperCase()}
                    </span>
                    <span style={{ fontSize:10, background: st.bg, color: st.color, borderRadius:99, padding:'2px 8px', fontWeight:600 }}>
                      {st.icon} {st.label}
                    </span>
                    {/* Badge annulée par vendeur */}
                    {order.status === 'annule' && order.cancelledBy === 'seller' && (
                      <span style={{ fontSize:10, background:'#fee2e2', color:'#991b1b', borderRadius:99, padding:'2px 8px', fontWeight:600 }}>
                        Refusée par le vendeur
                      </span>
                    )}
                  </div>
                  <p style={{ margin:0, fontSize:13, color:'#4A4A4A' }}>
                    {order.items?.length} article{(order.items?.length || 0) > 1 ? 's' : ''} · {order.sellerName}
                  </p>
                  <p style={{ margin:'4px 0 0', fontSize:11, color:'#9A9A9A' }}>{order.date}</p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ margin:0, fontWeight:700, color:'#1A1A1A', fontSize:15 }}>{order.total?.toLocaleString()} <span style={{ fontSize:11, fontWeight:400, color:'#9A9A9A' }}>FCFA</span></p>
                  <p style={{ margin:'2px 0 0', fontSize:10, color:'#9A9A9A' }}>{order.paymentMethodName}</p>
                </div>
              </div>

              {/* Détail expansible */}
              {isActive && selectedOrder && status && (
                <div style={{ marginTop:16, borderTop:'1px solid rgba(201,169,110,0.15)', paddingTop:16, animation:'fadeIn 0.25s ease' }}>

                  {/* Alerte si vendeur a annulé */}
                  {selectedOrder.status === 'annule' && selectedOrder.cancelledBy === 'seller' && (
                    <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'flex-start', gap:10 }}>
                      <span style={{ fontSize:20 }}>❌</span>
                      <div>
                        <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#991b1b' }}>Commande refusée par le vendeur</p>
                        <p style={{ margin:'4px 0 0', fontSize:12, color:'#b91c1c' }}>Le vendeur n'a pas pu traiter votre commande. Vous pouvez commander à nouveau.</p>
                      </div>
                    </div>
                  )}

                  {/* Statut visuel */}
                  <div style={{ background: status.bg, borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:22 }}>{status.icon}</span>
                    <div>
                      <p style={{ margin:0, fontSize:13, fontWeight:700, color: status.color }}>{status.label}</p>
                      <p style={{ margin:0, fontSize:11, color: status.color, opacity:0.75 }}>{selectedOrder.statusLabel}</p>
                    </div>
                  </div>

                  {/* Suivi étapes (masqué si annulée) */}
                  {selectedOrder.status !== 'annule' && (
                    <div style={{ marginBottom:16 }}>
                      {TRACKING_STEPS.map((step, i) => {
                        const done = step.doneWhen(selectedOrder.status);
                        return (
                          <div key={step.key} className="track-step">
                            <div className="track-dot" style={{ background: done ? '#d1fae5' : '#f3f4f6', color: done ? '#065f46' : '#9A9A9A' }}>
                              {step.icon}
                            </div>
                            <div>
                              <p style={{ margin:0, fontSize:13, fontWeight: done ? 600 : 400, color: done ? '#1A1A1A' : '#9A9A9A' }}>{step.label}</p>
                              {done && i === 0 && <p style={{ margin:0, fontSize:11, color:'#9A9A9A' }}>{selectedOrder.date}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Articles */}
                  <div style={{ marginBottom:16 }}>
                    <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, letterSpacing:'0.08em', color:'#9A9A9A', textTransform:'uppercase' }}>Articles</p>
                    {selectedOrder.items?.map((item, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom: i < selectedOrder.items.length-1 ? '1px solid #f3f4f6' : 'none' }}>
                        <div style={{ width:40, height:40, borderRadius:10, background:'#f3f4f6', overflow:'hidden', flexShrink:0 }}>
                          {item.image
                            ? <img src={item.image} alt={item.productName} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                            : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🌾</div>
                          }
                        </div>
                        <div style={{ flex:1 }}>
                          <p style={{ margin:0, fontSize:13, color:'#1A1A1A', fontWeight:500 }}>{item.productName}</p>
                          <p style={{ margin:0, fontSize:11, color:'#9A9A9A' }}>{item.quantity} {item.unit} · {item.productPrice?.toLocaleString()} FCFA/{item.unit}</p>
                        </div>
                        <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#1A1A1A' }}>{(item.productPrice * item.quantity)?.toLocaleString()} FCFA</p>
                      </div>
                    ))}
                  </div>

                  {/* Récap paiement */}
                  <div style={{ background:'#FAFAF8', borderRadius:12, padding:'14px 16px', marginBottom:16, border:'1px solid rgba(201,169,110,0.15)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontSize:12, color:'#9A9A9A' }}>Acompte payé (25%)</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'#065f46' }}>{selectedOrder.depositAmount?.toLocaleString()} FCFA ✓</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:12, color:'#9A9A9A' }}>Solde à la livraison</span>
                      <span style={{ fontSize:12, fontWeight:600, color: selectedOrder.status === 'livre' ? '#9A9A9A' : '#92400e' }}>
                        {selectedOrder.status === 'livre' ? '✓ Réglé' : `${selectedOrder.remainingAmount?.toLocaleString()} FCFA`}
                      </span>
                    </div>
                    <div style={{ height:1, background:'rgba(201,169,110,0.2)', margin:'10px 0' }} />
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#1A1A1A' }}>Total</span>
                      <span style={{ fontSize:14, fontWeight:700, color:'#1A1A1A' }}>{selectedOrder.total?.toLocaleString()} FCFA</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {/* Contacter le vendeur via WhatsApp */}
                    {selectedOrder.sellerPhone && (
                      <a
                        href={`https://wa.me/${selectedOrder.sellerPhone.replace(/\D/g,'')}?text=${encodeURIComponent(`Bonjour, je vous contacte pour ma commande ${selectedOrder.orderNumber || selectedOrder.id.slice(0,8).toUpperCase()}.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="wa-btn"
                      >
                        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.121 1.531 5.856L.073 23.27a.75.75 0 00.918.882l5.57-1.461A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.73 9.73 0 01-4.964-1.363l-.355-.212-3.676.965.978-3.576-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                        </svg>
                        Contacter le vendeur
                      </a>
                    )}

                    {/* Annulation client (seulement si commande encore annulable) */}
                    {canCancel && (
                      <button
                        className="cancel-btn"
                        disabled={cancelling === selectedOrder.id}
                        onClick={e => { e.stopPropagation(); handleCancelOrder(selectedOrder.id); }}
                      >
                        {cancelling === selectedOrder.id
                          ? <><span style={{ width:14, height:14, border:'2px solid #991b1b', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.8s linear infinite' }} /> Annulation…</>
                          : <>✕ Annuler la commande</>
                        }
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersContent />
    </Suspense>
  );
}
