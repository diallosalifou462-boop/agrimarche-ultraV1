'use client';

import { useState, useEffect, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag, Search, MessageCircle, CheckCircle, XCircle,
  Truck, Package, Clock, AlertTriangle, UserX,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  collection, query, where, doc, updateDoc, onSnapshot, Timestamp, getDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import DeliveryUpdateButton from '@/components/DeliveryUpdateButton';

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  status: string;
  statusLabel?: string;
  date: string;
  products: { name: string; quantity: number; price: number }[];
  sellerId: string;
  userId: string;
  createdAt?: any;
  orderNumber?: string;
  cancelledBy?: string;
  cancelledAt?: any;
  deliveryStatus?: string;
}

// ─── NORMALISATION DES ANCIENS STATUTS FIRESTORE ────────────────────────────
// Anciens docs Firestore : 'expediee' → 'en_livraison', 'livree' → 'livre', etc.
// ─────────────────────────────────────────────────────────────────────────────
const LEGACY_STATUS: Record<string, string> = {
  expediee:  'en_livraison',
  livree:    'livre',
  annulee:   'annule',
  pending:   'en_attente',
  preparing: 'en_preparation',
  shipped:   'en_livraison',
  delivered: 'livre',
  cancelled: 'annule',
};
function normalizeStatus(s: string): string {
  return LEGACY_STATUS[s] ?? s;
}

// ─── SOURCE DE VÉRITÉ DES STATUTS ────────────────────────────────────────────
// en_attente → en_preparation → en_livraison → livre
//                                            ↘ annule (cancelledBy: 'client'|'seller')
// Ces clés DOIVENT être identiques dans les 3 pages (seller, account, account/orders)
// ─────────────────────────────────────────────────────────────────────────────
const getStatusInfo = (status: string) => {
  const map: Record<string, { label: string; color: string; icon: JSX.Element }> = {
    en_attente:     { label: 'En attente',     color: 'bg-amber-100 text-amber-700',   icon: <Clock size={14} className="mr-1" /> },
    en_preparation: { label: 'En préparation', color: 'bg-blue-100 text-blue-700',    icon: <Package size={14} className="mr-1" /> },
    en_livraison:   { label: 'En livraison',   color: 'bg-purple-100 text-purple-700', icon: <Truck size={14} className="mr-1" /> },
    livre:          { label: 'Livrée',         color: 'bg-green-100 text-green-700',  icon: <CheckCircle size={14} className="mr-1" /> },
    annule:         { label: 'Annulée',        color: 'bg-red-100 text-red-700',      icon: <XCircle size={14} className="mr-1" /> },
  };
  return map[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: <></> };
};

// Mapping status → deliveryStatus (aligné avec DeliveryUpdateButton)
const STATUS_TO_DELIVERY: Record<string, string> = {
  en_attente:     'pending',
  en_preparation: 'preparing',
  en_livraison:   'shipped',
  livre:          'delivered',
  annule:         'pending',
};

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // ── Sync temps réel ──────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); router.replace('/auth/login'); return; }

    const q = query(collection(db, 'orders'), where('sellerId', '==', user.uid));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => {
        const dd = d.data();
        const raw = dd.status || 'en_attente';
        const normalized = normalizeStatus(raw);
        console.log(`[AgriMarché/SellerOrders] Order ${d.id.slice(-6)} | raw="${raw}" → "${normalized}" | amount=${dd.total || 0}`);
        return {
          id: d.id,
          customerName:   dd.userName || 'Client inconnu',
          customerPhone:  dd.userPhone || 'Non renseigné',
          amount:         dd.total || 0,
          status:         normalized,
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

  // ── Mise à jour statut (vendeur) ─────────────────────────────────────────
  // ✅ FIX : writeBatch pour synchroniser orders + seller_orders en une seule opération atomique
  const updateStatus = async (id: string, newStatus: string, statusLabel: string) => {
    setUpdating(id);
    try {
      const orderRef      = doc(db, 'orders', id);
      const sellerOrderRef = doc(db, 'seller_orders', id);

      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data();

      const payload: Record<string, any> = {
        status:         newStatus,
        statusLabel,
        deliveryStatus: STATUS_TO_DELIVERY[newStatus] || 'pending',
        updatedAt:      new Date().toISOString(),
      };

      if (newStatus === 'annule') {
        payload.cancelledBy = 'seller';
        payload.cancelledAt = Timestamp.now();
      }

      // ✅ set+merge évite "No document to update" si le doc n'existe que dans seller_orders
      const batch = writeBatch(db);
      batch.set(orderRef, payload, { merge: true });

      const sellerOrderSnap = await getDoc(sellerOrderRef);
      if (sellerOrderSnap.exists()) {
        batch.set(sellerOrderRef, payload, { merge: true });
      }

      await batch.commit();

      // 🔔 Notification client — expédition
      if (newStatus === 'en_livraison' && orderData?.userId) {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: orderData.userId,
            title: '🚚 Commande expédiée',
            body: `Votre commande #${orderData.orderNumber || id.slice(-8)} est en route !`,
            link: '/account/orders',
          }),
        });
      }

      // 🔔 Notification client — refus vendeur
      if (newStatus === 'annule' && orderData?.userId) {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: orderData.userId,
            title: '❌ Commande refusée',
            body: `Le vendeur n'a pas pu traiter votre commande #${orderData.orderNumber || id.slice(-8)}`,
            link: '/account/orders',
          }),
        });
      }

    } catch (err: any) {
      console.error(err);
      const isOffline = !navigator.onLine || err?.code === 'unavailable' || err?.message?.includes('offline');
      alert(isOffline
        ? '📶 Pas de connexion internet. Reconnecte-toi et réessaie.'
        : 'Erreur lors de la mise à jour : ' + (err?.message || err));
    } finally {
      setUpdating(null);
    }
  };

  const filteredOrders = orders.filter(o =>
    o.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* En-tête */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ShoppingBag className="text-emerald-600" /> Mes commandes
          </h1>
          <p className="text-sm text-gray-500 mt-1">{filteredOrders.length} commande{filteredOrders.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Recherche */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par client ou N° commande…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        {/* Liste */}
        <div className="space-y-4">
          {filteredOrders.length > 0 ? filteredOrders.map((order) => {
            const statusInfo   = getStatusInfo(order.status);
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
                {/* Alerte annulation client */}
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

                {/* En-tête */}
                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center ${statusInfo.color}`}>
                        {statusInfo.icon}{statusInfo.label}
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
                    <p className="font-semibold text-gray-800">{order.customerName}</p>
                    <p className="text-sm text-gray-500">{order.customerPhone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-700">{order.amount?.toLocaleString() || '0'} FCFA</p>
                    <p className="text-xs text-gray-400">{order.date || 'Date inconnue'}</p>
                  </div>
                </div>

                {/* Produits (masqués si annulé) */}
                {order.products?.length > 0 && !isCancelled && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Produits :</p>
                    <div className="space-y-2">
                      {order.products.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-gray-700">{item.name} x{item.quantity}</span>
                          <span className="font-semibold text-gray-800">
                            {((item.price || 0) * (item.quantity || 1)).toLocaleString()} FCFA
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

                {/* Actions — désactivées si annulé */}
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

                    {order.customerPhone && order.customerPhone !== 'Non renseigné' && (
                      <a
                        href={`https://wa.me/${order.customerPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-gray-50 transition"
                      >
                        <MessageCircle className="w-4 h-4" />WhatsApp
                      </a>
                    )}

                    {order.status === 'en_livraison' && (
                      <DeliveryUpdateButton
                        orderId={order.id}
                        currentStep={order.deliveryStatus || 'pending'}
                      />
                    )}
                  </div>
                )}

                {/* Message si annulée */}
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
              <p className="text-gray-500">Aucune commande trouvée.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
