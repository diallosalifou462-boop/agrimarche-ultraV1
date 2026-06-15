'use client';

import React from 'react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  collection,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  onSnapshot,
  Timestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import {
  CheckCircle,
  XCircle,
  Truck,
  Clock,
  Package,
  ArrowLeft,
  AlertTriangle,
  MapPin,
} from 'lucide-react';
import DeliveryTracker from '@/components/DeliveryTracker';
import { DELIVERY_STEPS } from '@/lib/deliveryTracking';
import DeliveryMap from '@/components/DeliveryMap';

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Sync temps réel
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setOrders(
          snap.docs.map((d) => ({
            ...d.data(),
            firestoreId: d.id,
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  // Annulation client
  const handleCancelOrder = async (orderId: string) => {
    const ok = confirm(
      '⚠️ Annuler cette commande ?\n\nLe vendeur en sera informé immédiatement.'
    );
    if (!ok) return;

    setUpdating(orderId);
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data();

      await updateDoc(orderRef, {
        status: 'annulee',
        statusLabel: 'Annulée par le client',
        cancelledBy: 'client',
        cancelledAt: Timestamp.now(),
        updatedAt: new Date().toISOString(),
      });

      if (orderData?.sellerId) {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: orderData.sellerId,
            title: '❌ Commande annulée',
            body: `${orderData.userName || 'Un client'} a annulé sa commande #${
              orderData.orderNumber || orderId.slice(-8)
            }`,
            link: '/seller/orders',
          }),
        });
      }
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'annulation.");
    } finally {
      setUpdating(null);
    }
  };

  // Confirmation réception
  const handleConfirmDelivery = async (orderId: string) => {
    const confirmed = confirm('✅ Confirmez-vous avoir reçu votre commande ?');
    if (!confirmed) return;

    setUpdating(orderId);
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data();

      await updateDoc(orderRef, {
        status: 'livree',
        statusLabel: 'Livrée – confirmée par le client',
        updatedAt: new Date().toISOString(),
      });

      if (orderData?.sellerId) {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: orderData.sellerId,
            title: '✅ Commande livrée',
            body: `${orderData.userName || 'Le client'} a confirmé la réception de sa commande #${
              orderData.orderNumber || orderId.slice(-8)
            }`,
            link: '/seller/orders',
          }),
        });
      }

      alert('🎉 Merci ! Votre confirmation a été enregistrée.');
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la confirmation.');
    } finally {
      setUpdating(null);
    }
  };

  const formatDate = (date: any) => {
    if (!date) return 'Date inconnue';
    if (date?.toDate) {
      return date.toDate().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return date;
  };

  const getStatusInfo = (status: string): { label: string; color: string; icon: React.ReactElement } => {
    const map: Record<string, { label: string; color: string; icon: React.ReactElement }> = {
      en_attente: {
        label: 'En attente',
        color: 'bg-yellow-100 text-yellow-700',
        icon: React.createElement(Clock, { size: 14, className: 'mr-1' }),
      },
      en_preparation: {
        label: 'En préparation',
        color: 'bg-blue-100 text-blue-700',
        icon: React.createElement(Package, { size: 14, className: 'mr-1' }),
      },
      expediee: {
        label: 'Expédiée',
        color: 'bg-purple-100 text-purple-700',
        icon: React.createElement(Truck, { size: 14, className: 'mr-1' }),
      },
      livree: {
        label: 'Livrée',
        color: 'bg-green-100 text-green-700',
        icon: React.createElement(CheckCircle, { size: 14, className: 'mr-1' }),
      },
      annulee: {
        label: 'Annulée',
        color: 'bg-red-100 text-red-700',
        icon: React.createElement(XCircle, { size: 14, className: 'mr-1' }),
      },
    };
    return map[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: React.createElement(React.Fragment) };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Chargement de vos commandes…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/account"
            className="flex items-center gap-2 text-gray-600 hover:text-emerald-600 transition"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Mon compte</span>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">📦 Mes commandes</h1>
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm mt-4">
            <div className="text-6xl mb-4">📦</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Aucune commande</h2>
            <p className="text-gray-500 text-sm mb-6">
              Vous n'avez pas encore passé de commande.
            </p>
            <Link href="/main/products">
              <button className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition">
                Découvrir les produits
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {orders.map((order) => {
              const statusInfo = getStatusInfo(order.status);
              const canCancel = ['en_attente', 'en_preparation'].includes(order.status);
              const canConfirm = order.status === 'expediee';
              const canTrack = order.status === 'expediee';
              const isUpdating = updating === order.firestoreId;
              const cancelledBySeller = order.status === 'annulee' && order.cancelledBy === 'seller';
              const cancelledByClient = order.status === 'annulee' && order.cancelledBy === 'client';

              return (
                <div
                  key={order.firestoreId}
                  className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition border border-gray-100"
                >
                  {/* En-tête */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-gray-900">
                        Commande #{order.orderNumber || order.id?.slice(-8).toUpperCase()}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(order.createdAt)}</p>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center ${statusInfo.color}`}
                    >
                      {statusInfo.icon}
                      {statusInfo.label}
                    </div>
                  </div>

                  {/* Annulée par le vendeur */}
                  {cancelledBySeller && (
                    <div className="mb-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                      <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-rose-700">Commande refusée par le vendeur</p>
                        <p className="text-xs text-rose-500 mt-0.5">
                          Le vendeur n'a pas pu traiter votre commande. Vous pouvez en passer une nouvelle
                          ci-dessous.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Annulée par le client */}
                  {cancelledByClient && (
                    <div className="mb-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2">
                      <XCircle size={15} className="text-gray-400 shrink-0" />
                      <p className="text-xs text-gray-500 font-medium">
                        Vous avez annulé cette commande.
                      </p>
                    </div>
                  )}

                  {/* Produits */}
                  <div className="border-t border-gray-100 pt-3 mt-2 space-y-2">
                    {order.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-600">
                          {item.quantity}x {item.productName}
                        </span>
                        <span className="font-medium text-gray-800">
                          {(item.price * item.quantity).toLocaleString()} FCFA
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Total + actions */}
                  <div className="border-t border-gray-100 pt-3 mt-3">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="font-bold text-emerald-600 text-lg">
                          {order.total?.toLocaleString()} FCFA
                        </p>
                      </div>
                      {order.status === 'livree' && (
                        <div className="flex items-center gap-1 text-green-600 text-xs font-medium bg-green-50 px-3 py-1 rounded-full">
                          <CheckCircle size={12} />
                          Livrée
                        </div>
                      )}
                    </div>

                    {/* Suivi de livraison */}
                    {order.deliverySteps && (
                      <div className="mt-4">
                        <DeliveryTracker
                          steps={DELIVERY_STEPS.map((step, idx) => ({
                            ...step,
                            completed:
                              order.deliverySteps[
                                step.label.toLowerCase().replace(/ /g, '_').replace(/[^a-z_]/g, '')
                              ]?.completed || false,
                            timestamp:
                              order.deliverySteps[
                                step.label.toLowerCase().replace(/ /g, '_').replace(/[^a-z_]/g, '')
                              ]?.timestamp || null,
                          }))}
                          currentStatus={order.deliveryStatus || 'pending'}
                          estimatedDate={order.estimatedDelivery}
                        />
                      </div>
                    )}

                    {/* Carte de livraison */}
                    {order.sellerLocation?.lat && order.customerLocation?.lat && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                          🗺️ Parcours de livraison
                        </h4>
                        <DeliveryMap
                          pickupLocation={{
                            lat: order.sellerLocation.lat,
                            lng: order.sellerLocation.lng,
                            address: order.sellerLocation.address || 'Boutique du vendeur',
                          }}
                          deliveryLocation={{
                            lat: order.customerLocation.lat,
                            lng: order.customerLocation.lng,
                            address: order.customerLocation.address || 'Votre adresse',
                          }}
                        />
                      </div>
                    )}

                    {/* Boutons d'action */}
                    <div className="flex gap-3">
                      {canCancel && (
                        <button
                          onClick={() => handleCancelOrder(order.firestoreId)}
                          disabled={isUpdating}
                          className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
                        >
                          {isUpdating ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <XCircle size={16} />
                          )}
                          {isUpdating ? 'En cours…' : 'Annuler la commande'}
                        </button>
                      )}

                      {canTrack && (
                        <Link href={`/tracking/${order.firestoreId}`} className="flex-1">
                          <button className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition">
                            <MapPin size={16} />
                            Suivre mon colis
                          </button>
                        </Link>
                      )}

                      {canConfirm && (
                        <button
                          onClick={() => handleConfirmDelivery(order.firestoreId)}
                          disabled={isUpdating}
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
                        >
                          <CheckCircle size={16} />
                          Confirmer réception
                        </button>
                      )}

                      {order.status === 'annulee' && (
                        <Link href="/main/products" className="flex-1">
                          <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition">
                            <Package size={16} />
                            Commander à nouveau
                          </button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}