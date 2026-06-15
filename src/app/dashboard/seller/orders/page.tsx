'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { Order, OrderStatus } from '@/types';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:    '⏳ En attente',
  confirmed:  '✅ Confirmée',
  processing: '📦 Préparation',
  shipped:    '🚚 En livraison',
  delivered:  '🎉 Livrée',
  cancelled:  '❌ Annulée',
  refunded:   '↩️ Remboursée',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending:    'bg-yellow-50 text-yellow-700 border-yellow-200',
  confirmed:  'bg-blue-50 text-blue-700 border-blue-200',
  processing: 'bg-purple-50 text-purple-700 border-purple-200',
  shipped:    'bg-orange-50 text-orange-700 border-orange-200',
  delivered:  'bg-green-50 text-green-700 border-green-200',
  cancelled:  'bg-red-50 text-red-700 border-red-200',
  refunded:   'bg-gray-50 text-gray-700 border-gray-200',
};

// Prochains statuts possibles pour chaque statut
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['processing', 'cancelled'],
  processing: ['shipped'],
  shipped:    ['delivered'],
};

function formatPrice(n: number) {
  return new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n);
}

function formatDate(date: unknown) {
  if (!date) return '';
  const d = (date as { toDate?: () => Date }).toDate?.() ?? new Date(date as string);
  return new Intl.DateTimeFormat('fr-SN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

export default function SellerOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    // Commandes contenant au moins un produit du vendeur
    const q = query(
      collection(db, 'orders'),
      where('sellerIds', 'array-contains', user.uid),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdating(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(null);
    }
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const counts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center"><div className="text-4xl mb-3">🧾</div>
          <p className="text-gray-500 text-sm">Chargement des commandes…</p></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="font-bold text-gray-900 text-lg mb-4">Commandes reçues</h1>

      {/* Filtres par statut */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
        <FilterBtn label={`Toutes (${orders.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
        {(['pending','confirmed','processing','shipped','delivered','cancelled'] as OrderStatus[]).map(s => (
          counts[s] ? (
            <FilterBtn
              key={s}
              label={`${STATUS_LABELS[s].split(' ')[0]} ${STATUS_LABELS[s].split(' ').slice(1).join(' ')} (${counts[s]})`}
              active={filter === s}
              onClick={() => setFilter(s)}
            />
          ) : null
        ))}
      </div>

      {/* Liste commandes */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🧾</div>
          <p className="font-semibold text-gray-900 mb-2">Aucune commande</p>
          <p className="text-sm text-gray-500">Les commandes de vos clients apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(order => {
            const nextStatuses = NEXT_STATUS[order.status] ?? [];
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                {/* En-tête commande */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">
                      #{order.id.slice(-6).toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.createdAt)}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[order.status]}`}>
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>

                {/* Articles */}
                <div className="space-y-1.5 mb-3 p-3 bg-gray-50 rounded-xl">
                  {order.items.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                      <span>{item.product.name} × {item.quantity} {item.product.unit}</span>
                      <span className="font-medium">{formatPrice(item.product.price * item.quantity)}</span>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <p className="text-xs text-gray-400">+{order.items.length - 3} autre(s)</p>
                  )}
                </div>

                {/* Total + adresse */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    {order.deliveryAddress && (
                      <p className="text-xs text-gray-500">
                        📍 {order.deliveryAddress.city}, {order.deliveryAddress.region}
                      </p>
                    )}
                  </div>
                  <span className="font-bold text-green-700 text-sm">{formatPrice(order.total)}</span>
                </div>

                {/* Actions de changement de statut */}
                {nextStatuses.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {nextStatuses.map(s => (
                      <button
                        key={s}
                        onClick={() => updateStatus(order.id, s)}
                        disabled={updating === order.id}
                        className={`text-xs font-medium px-3 py-2 rounded-xl border transition disabled:opacity-50 ${
                          s === 'cancelled'
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-green-200 text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {updating === order.id ? '…' : `→ ${STATUS_LABELS[s]}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 text-xs font-medium px-3 py-2 rounded-xl border transition ${
        active ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}
