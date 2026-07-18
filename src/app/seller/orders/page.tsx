'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag, Search, CheckCircle, XCircle,
  Truck, Package, Clock, UserX, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiUrl } from '@/lib/api-config';
import {
  collection, query, where, doc, updateDoc, onSnapshot, Timestamp, getDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import DeliveryUpdateButton from '@/components/DeliveryUpdateButton';
import {
  OrderStatus, ORDER_STATUS_CONFIG, STATUS_TO_DELIVERY,
  normalizeStatus, statusTint, formatFCFA,
} from '@/lib/orderStatus';

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  status: OrderStatus;
  statusLabel?: string;
  date: string;
  // ⚠️ FIX : le panier (checkout/page.tsx) écrit productName/productPrice,
  // jamais name/price — ces champs affichaient un produit sans nom à 0 FCFA
  // pour chaque commande, sur cette page seulement (account-orders-page.tsx
  // utilisait déjà les bons noms de champs).
  products: { productName: string; quantity: number; productPrice: number; unit?: string }[];
  sellerId: string;
  userId: string;
  createdAt?: any;
  orderNumber?: string;
  cancelledBy?: string;
  cancelledAt?: any;
  deliveryStatus?: string;
  delivererId?: string;
  delivererName?: string;
  delivererPhone?: string;
}

// L'icône de chaque statut (couleur/libellé viennent de @/lib/orderStatus)
const STATUS_ICON: Record<OrderStatus, React.ReactElement> = {
  en_attente:     <Clock size={13} />,
  en_preparation: <Package size={13} />,
  en_livraison:   <Truck size={13} />,
  livre:          <CheckCircle size={13} />,
  annule:         <XCircle size={13} />,
};

const FILTERS: { key: 'all' | OrderStatus; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'en_attente', label: ORDER_STATUS_CONFIG.en_attente.label },
  { key: 'en_preparation', label: ORDER_STATUS_CONFIG.en_preparation.label },
  { key: 'en_livraison', label: ORDER_STATUS_CONFIG.en_livraison.label },
  { key: 'livre', label: ORDER_STATUS_CONFIG.livre.label },
];

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | OrderStatus>('all');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); router.replace('/auth/login'); return; }

    const q = query(collection(db, 'orders'), where('sellerId', '==', user.uid));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => {
        const dd = d.data();
        const status = normalizeStatus(dd.status);
        return {
          id: d.id,
          customerName:   dd.userName || 'Client inconnu',
          customerPhone:  dd.userPhone || 'Non renseigné',
          amount:         dd.total || 0,
          status,
          statusLabel:    dd.statusLabel,
          date:           dd.date || new Date().toLocaleDateString('fr-FR'),
          products:       dd.items || [],
          sellerId:       dd.sellerId || '',
          userId:         dd.userId || '',
          createdAt:      dd.createdAt,
          orderNumber:    dd.orderNumber,
          cancelledBy:    dd.cancelledBy,
          cancelledAt:    dd.cancelledAt,
          deliveryStatus: dd.deliveryStatus || 'pending',
          delivererId:    dd.delivererId,
          delivererName:  dd.delivererName,
          delivererPhone: dd.delivererPhone,
        } as Order;
      });

      data.sort((a, b) => {
        if (a.createdAt && b.createdAt) return b.createdAt.seconds - a.createdAt.seconds;
        return 0;
      });

      setOrders(data);
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });

    return () => unsub();
  }, [user, authLoading]);

  const updateStatus = async (id: string, newStatus: OrderStatus, statusLabel: string) => {
    setUpdating(id);
    try {
      const orderRef       = doc(db, 'orders', id);
      const sellerOrderRef = doc(db, 'seller_orders', id);

      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data();

      const payload: Record<string, any> = {
        status:         newStatus,
        statusLabel,
        deliveryStatus: STATUS_TO_DELIVERY[newStatus],
        // Timestamp Firestore (pas une string ISO) : account-page.tsx compare
        // via `updatedAt?.seconds` pour garder la copie la plus récente entre
        // orders et seller_orders — une string ISO n'a pas de `.seconds` et
        // aurait rendu cette comparaison silencieusement inopérante.
        updatedAt:      Timestamp.now(),
      };

      if (newStatus === 'annule') {
        payload.cancelledBy = 'seller';
        payload.cancelledAt = Timestamp.now();
      }

      const batch = writeBatch(db);
      batch.set(orderRef, payload, { merge: true });

      const sellerOrderSnap = await getDoc(sellerOrderRef);
      if (sellerOrderSnap.exists()) {
        batch.set(sellerOrderRef, payload, { merge: true });
      }

      await batch.commit();

      const orderId = orderData?.orderNumber || id.slice(-8);
      const notifBase = { method: 'POST', headers: { 'Content-Type': 'application/json' } };

      if (orderData?.userId) {
        let notif: { title: string; body: string } | null = null;

        if (newStatus === 'en_preparation') {
          notif = { title: '👨‍🍳 Commande en préparation', body: `Votre commande #${orderId} est en cours de préparation par le vendeur.` };
        } else if (newStatus === 'en_livraison') {
          notif = { title: '🚚 Commande expédiée', body: `Votre commande #${orderId} est en route ! Vous serez livré bientôt.` };
        } else if (newStatus === 'livre') {
          notif = { title: '✅ Commande livrée', body: `Votre commande #${orderId} a été livrée. Confirmez la réception.` };
        } else if (newStatus === 'annule') {
          notif = { title: '❌ Commande refusée', body: `Le vendeur n'a pas pu traiter votre commande #${orderId}. Vous pouvez commander à nouveau.` };
        }

        if (notif) {
          fetch(apiUrl('/api/notifications/send'), {
            ...notifBase,
            body: JSON.stringify({
              userId: orderData.userId,
              title: notif.title,
              body: notif.body,
              link: '/account/orders',
              channels: ['push'],
            }),
          }).catch(console.error);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la mise à jour');
    } finally {
      setUpdating(null);
    }
  };

  const filteredOrders = useMemo(() => orders.filter(o => {
    const matchesFilter = activeFilter === 'all' || o.status === activeFilter;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      o.customerName?.toLowerCase().includes(term) ||
      o.id.toLowerCase().includes(term) ||
      (o.orderNumber || '').toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  }), [orders, activeFilter, searchTerm]);

  const stats = useMemo(() => {
    const nonCancelled = orders.filter(o => o.status !== 'annule');
    const revenue = nonCancelled.reduce((sum, o) => sum + (o.amount || 0), 0);
    const pending = orders.filter(o => o.status === 'en_attente').length;
    return { total: orders.length, revenue, pending };
  }, [orders]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ShoppingBag className="text-emerald-600" /> Mes commandes
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {stats.total} commande{stats.total !== 1 ? 's' : ''} au total
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400 font-medium">Chiffre d'affaires</p>
            <p className="text-lg font-bold text-emerald-700 mt-1">{formatFCFA(stats.revenue)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400 font-medium">En attente</p>
            <p className="text-lg font-bold mt-1" style={{ color: stats.pending > 0 ? ORDER_STATUS_CONFIG.en_attente.color : '#9ca3af' }}>
              {stats.pending}
            </p>
          </div>
        </div>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par client ou N° commande…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {FILTERS.map(f => {
            const active = activeFilter === f.key;
            const count = f.key === 'all' ? orders.length : orders.filter(o => o.status === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className="shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1.5"
                style={active
                  ? { background: '#065f46', borderColor: '#065f46', color: '#fff' }
                  : { background: '#fff', borderColor: '#e5e7eb', color: '#4b5563' }}
              >
                {f.label}
                <span
                  className="rounded-full text-[10px] font-bold px-1.5"
                  style={{ background: active ? 'rgba(255,255,255,0.2)' : '#f3f4f6', color: active ? '#fff' : '#6b7280' }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {filteredOrders.length > 0 ? filteredOrders.map((order) => {
            const cfg = ORDER_STATUS_CONFIG[order.status];
            const isUpdating   = updating === order.id;
            const isCancelledByClient = order.status === 'annule' && order.cancelledBy === 'client';
            const isCancelledBySeller = order.status === 'annule' && order.cancelledBy === 'seller';
            const isCancelled         = order.status === 'annule';

            return (
              <div
                key={order.id}
                className={`bg-white rounded-2xl shadow-sm border p-5 transition-all ${
                  isCancelledByClient ? 'border-orange-200 bg-orange-50/30' :
                  isCancelled         ? 'border-red-100 opacity-70' :
                  'border-gray-100'
                }`}
              >
                {isCancelledByClient && (
                  <div className="mb-4 bg-orange-100 border border-orange-300 rounded-xl px-4 py-3 flex items-start gap-2">
                    <UserX size={16} className="text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-orange-700">⚠️ Commande annulée par le client</p>
                      <p className="text-xs text-orange-600 mt-0.5">
                        Ne pas préparer ni expédier cette commande. Le client a annulé avant la livraison.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1"
                        style={{ background: statusTint(order.status, 0.12), color: cfg.color }}
                      >
                        {STATUS_ICON[order.status]}{cfg.label}
                      </span>
                      {isCancelledByClient && (
                        <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full border border-orange-200">
                          Annulé par le client
                        </span>
                      )}
                      {isCancelledBySeller && (
                        <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full border border-red-200">
                          Refusé par vous
                        </span>
                      )}
                      <span className="text-xs text-gray-400 font-mono">
                        #{order.orderNumber || order.id.slice(-8)}
                      </span>
                    </div>
                    {/* ✅ FIX : le vendeur ne doit voir que le nom du client,
                        jamais son numéro de téléphone (confidentialité). */}
                    <p className="font-semibold text-gray-800">{order.customerName}</p>
                    {order.delivererId && (
                      <p className="text-sm text-blue-600 flex items-center gap-1 mt-1">
                        🚴 Livreur : {order.delivererName || '—'}{order.delivererPhone ? ` · ${order.delivererPhone}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-700">{formatFCFA(order.amount)}</p>
                    <p className="text-xs text-gray-400">{order.date || 'Date inconnue'}</p>
                  </div>
                </div>

                {order.products?.length > 0 && !isCancelled && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Produits :</p>
                    <div className="space-y-2">
                      {order.products.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-gray-700">{item.productName} x{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
                          <span className="font-semibold text-gray-800">
                            {formatFCFA((item.productPrice || 0) * (item.quantity || 1))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isCancelledByClient && order.products?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-orange-100">
                    <p className="text-xs text-orange-500 italic">
                      Les produits ne sont plus affichés — commande annulée par le client.
                    </p>
                  </div>
                )}

                {!isCancelled && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {order.status === 'en_attente' && (
                      <>
                        <button
                          onClick={() => updateStatus(order.id, 'en_preparation', 'En préparation')}
                          disabled={isUpdating}
                          className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2"
                        >
                          {isUpdating ? '…' : '✅ Accepter'}
                        </button>
                        <button
                          onClick={() => updateStatus(order.id, 'annule', 'Annulée par le vendeur')}
                          disabled={isUpdating}
                          className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition disabled:opacity-50"
                        >
                          {isUpdating ? '…' : '❌ Refuser'}
                        </button>
                      </>
                    )}

                    {order.status === 'en_preparation' && (
                      <>
                        <button
                          onClick={() => updateStatus(order.id, 'en_livraison', 'En livraison')}
                          disabled={isUpdating}
                          className="px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-medium hover:bg-purple-600 transition disabled:opacity-50"
                        >
                          {isUpdating ? '…' : '🚚 Expédier'}
                        </button>
                        <button
                          onClick={() => updateStatus(order.id, 'annule', 'Annulée par le vendeur')}
                          disabled={isUpdating}
                          className="px-4 py-2 border border-red-300 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition disabled:opacity-50"
                        >
                          Annuler commande
                        </button>
                      </>
                    )}

                    {order.status === 'en_livraison' && (
                      <button
                        onClick={() => updateStatus(order.id, 'livre', 'Livrée')}
                        disabled={isUpdating}
                        className="px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition disabled:opacity-50"
                      >
                        {isUpdating ? '…' : '✅ Marquer comme livrée'}
                      </button>
                    )}

                    {/* ✅ FIX : le lien WhatsApp direct exposait le numéro du client
                        (visible dans le lien et dans la conversation WhatsApp
                        ouverte). Retiré : le vendeur ne doit voir que le nom. */}

                    {order.status === 'en_livraison' && (
                      <DeliveryUpdateButton
                        orderId={order.id}
                        currentStep={order.deliveryStatus || 'pending'}
                      />
                    )}
                  </div>
                )}

                {isCancelled && (
                  <div className="mt-4 pt-4 border-t border-red-100 flex items-center gap-2">
                    <XCircle size={15} className="text-red-400 shrink-0" />
                    <p className="text-sm text-red-500">
                      {isCancelledByClient ? 'Annulée par le client — aucune action requise.' : 'Commande refusée — aucune action requise.'}
                    </p>
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
              <ShoppingBag size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {searchTerm || activeFilter !== 'all' ? 'Aucune commande ne correspond' : 'Aucune commande trouvée.'}
              </p>
              {(searchTerm || activeFilter !== 'all') && (
                <button
                  onClick={() => { setSearchTerm(''); setActiveFilter('all'); }}
                  className="mt-3 text-sm text-emerald-600 font-medium flex items-center gap-1 mx-auto"
                >
                  Réinitialiser les filtres <ChevronRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
