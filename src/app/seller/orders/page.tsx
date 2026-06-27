'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag, Search, MessageCircle, CheckCircle, XCircle,
  Truck, Package, Clock, AlertTriangle, UserX,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  collection, query, where, doc, updateDoc, onSnapshot, Timestamp, getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import DeliveryUpdateButton from './DeliveryUpdateButton';
import React from 'react'; // ✅ Ajout de l'import React

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
  cancelledBy?: string;   // 'client' | 'seller'
  cancelledAt?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUTS UNIFIÉS — identiques dans checkout-page.tsx et orders-page.tsx
//   en_attente → en_preparation → en_livraison → livre   (flux normal)
//                                              ↘ annule  (vendeur ou client)
// ─────────────────────────────────────────────────────────────────────────────
const getStatusInfo = (status: string) => {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    en_attente:     { label: 'En attente',     color: 'bg-amber-100 text-amber-700',   icon: React.createElement(Clock,       { size: 14, className: "mr-1" }) },
    en_preparation: { label: 'En préparation', color: 'bg-blue-100 text-blue-700',    icon: React.createElement(Package,     { size: 14, className: "mr-1" }) },
    en_livraison:   { label: 'En livraison',   color: 'bg-purple-100 text-purple-700', icon: React.createElement(Truck,       { size: 14, className: "mr-1" }) },
    livre:          { label: 'Livrée',         color: 'bg-green-100 text-green-700',  icon: React.createElement(CheckCircle, { size: 14, className: "mr-1" }) },
    annule:         { label: 'Annulée',        color: 'bg-red-100 text-red-700',      icon: React.createElement(XCircle,     { size: 14, className: "mr-1" }) },
  };
  return map[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: React.createElement(React.Fragment) };
};

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  // ── Sync temps réel ──────────────────────────────────────────────────────
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return; // Attendre que l'auth soit prête
    if (!user) { setLoading(false); router.replace('/auth/login'); return; }

    const q = query(collection(db, 'orders'), where('sellerId', '==', user.uid));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => {
        const dd = d.data();
        return {
          id: d.id,
          customerName:  dd.userName || 'Client inconnu',
          customerPhone: dd.userPhone || 'Non renseigné',
          amount:        dd.total || 0,
          status:        dd.status || 'en_attente',
          statusLabel:   dd.statusLabel,
          date:          dd.date || new Date().toLocaleDateString('fr-FR'),
          products:      dd.items || [],
          sellerId:      dd.sellerId || '',
          userId:        dd.userId || '',
          createdAt:     dd.createdAt,
          orderNumber:   dd.orderNumber,
          cancelledBy:   dd.cancelledBy,
          cancelledAt:   dd.cancelledAt,
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
  }, [user, authLoading, router]);

  // ── Mise à jour statut (vendeur) ─────────────────────────────────────────
  const updateStatus = async (id: string, newStatus: string, statusLabel: string) => {
    setUpdating(id);
    try {
      const orderRef = doc(db, 'orders', id);
      
      // Récupérer la commande pour avoir les infos client
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data();
      
      const payload: Record<string, any> = {
        status: newStatus,
        statusLabel,
        updatedAt: new Date().toISOString(),
      };
      // Si le vendeur annule, on trace qui a annulé
      if (newStatus === 'annule') {
        payload.cancelledBy  = 'seller';   // ← le client verra l'alerte
        payload.cancelledAt  = Timestamp.now();
      }
      await updateDoc(orderRef, payload);
      
      // 🔔 NOTIFICATION AU CLIENT (quand en livraison)
      if (newStatus === 'en_livraison' && orderData?.userId) {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: orderData.userId,
            title: '🚚 Commande en livraison',
            body: `Votre commande #${orderData.orderNumber || id.slice(-8)} est en route !`,
            link: '/account/orders',
          }),
        });
      }
      
      // 🔔 NOTIFICATION AU CLIENT (quand livrée)
      if (newStatus === 'livre' && orderData?.userId) {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: orderData.userId,
            title: '📦 Commande livrée',
            body: `Votre commande #${orderData.orderNumber || id.slice(-8)} a été livrée. Merci !`,
            link: '/account/orders',
          }),
        });
      }
      
      // 🔔 NOTIFICATION AU CLIENT (quand le vendeur annule)
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
      
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la mise à jour');
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto" />
        <p className="mt-4 text-gray-600">Chargement des commandes…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-bold text-lg flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                🚚 Commandes en temps réel
              </p>
              <p className="text-emerald-100 text-sm mt-1">Répondez rapidement pour gagner plus de clients.</p>
            </div>
            <div className="bg-white/20 px-4 py-2 rounded-xl text-sm font-semibold">AgriMarché Sénégal</div>
          </div>
        </div>

        {/* Recherche */}
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher client, commande ou numéro…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none bg-white"
          />
        </div>

        {/* Liste */}
        <div className="space-y-4">
          {filteredOrders.length > 0 ? filteredOrders.map((order) => {
            const statusInfo      = getStatusInfo(order.status);
            const isUpdating      = updating === order.id;
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
                {/* ── Annulée par le CLIENT → alerte vendeur bien visible ── */}
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

                {/* Produits (masqués si annulé par client pour éviter tout traitement) */}
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

                {/* Produits masqués si annulé par client */}
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
                          onClick={() => updateStatus(order.id, 'en_livraison', 'En cours de livraison')}
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
                        onClick={() => updateStatus(order.id, 'livre', 'Livrée avec succès')}
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

                    {/* ✅ AJOUTE LE BOUTON DE SUIVI ICI */}
                    <DeliveryUpdateButton
                      orderId={order.id}
                      currentStep={(order as any).deliveryStatus || 'pending'}
                      onUpdate={() => {
                        // Recharger la page pour voir le nouveau statut
                        window.location.reload();
                      }}
                    />
                  </div>
                )}

                {/* Message si annulée — aucune action disponible */}
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