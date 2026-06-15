"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = OrdersPage;
const link_1 = __importDefault(require("next/link"));
const react_1 = require("react");
const useAuth_1 = require("@/hooks/useAuth");
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("@/lib/firebase/firebase");
const lucide_react_1 = require("lucide-react");
const DeliveryTracker_1 = __importDefault(require("@/components/DeliveryTracker"));
const deliveryTracking_1 = require("@/lib/deliveryTracking");
const DeliveryMap_1 = __importDefault(require("@/components/DeliveryMap"));
function OrdersPage() {
    const { user } = (0, useAuth_1.useAuth)();
    const [orders, setOrders] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [updating, setUpdating] = (0, react_1.useState)(null);
    // ── Sync temps réel ──────────────────────────────────────────────────────
    (0, react_1.useEffect)(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'orders'), (0, firestore_1.where)('userId', '==', user.uid), (0, firestore_1.orderBy)('createdAt', 'desc'));
        const unsub = (0, firestore_1.onSnapshot)(q, (snap) => {
            setOrders(snap.docs.map(d => (Object.assign(Object.assign({}, d.data()), { firestoreId: d.id }))));
            setLoading(false);
        }, (err) => { console.error(err); setLoading(false); });
        return () => unsub();
    }, [user]);
    // ── Annulation CLIENT → updateDoc (jamais deleteDoc) ────────────────────
    const handleCancelOrder = async (orderId) => {
        const ok = confirm('⚠️ Annuler cette commande ?\n\nLe vendeur en sera informé immédiatement.');
        if (!ok)
            return;
        setUpdating(orderId);
        try {
            const orderRef = (0, firestore_1.doc)(firebase_1.db, 'orders', orderId);
            const orderSnap = await (0, firestore_1.getDoc)(orderRef);
            const orderData = orderSnap.data();
            await (0, firestore_1.updateDoc)(orderRef, {
                status: 'annulee',
                statusLabel: 'Annulée par le client',
                cancelledBy: 'client',
                cancelledAt: firestore_1.Timestamp.now(),
                updatedAt: new Date().toISOString(),
            });
            if (orderData === null || orderData === void 0 ? void 0 : orderData.sellerId) {
                await fetch('/api/notifications/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: orderData.sellerId,
                        title: '❌ Commande annulée',
                        body: `${orderData.userName || 'Un client'} a annulé sa commande #${orderData.orderNumber || orderId.slice(-8)}`,
                        link: '/seller/orders',
                    }),
                });
                console.log('✅ Notification vendeur envoyée');
            }
        }
        catch (err) {
            console.error(err);
            alert('Erreur lors de l\'annulation.');
        }
        finally {
            setUpdating(null);
        }
    };
    // ── Confirmation réception ───────────────────────────────────────────────
    const handleConfirmDelivery = async (orderId) => {
        const confirmed = confirm('✅ Confirmez-vous avoir reçu votre commande ?');
        if (!confirmed)
            return;
        setUpdating(orderId);
        try {
            const orderRef = (0, firestore_1.doc)(firebase_1.db, 'orders', orderId);
            const orderSnap = await (0, firestore_1.getDoc)(orderRef);
            const orderData = orderSnap.data();
            await (0, firestore_1.updateDoc)(orderRef, {
                status: 'livree',
                statusLabel: 'Livrée – confirmée par le client',
                updatedAt: new Date().toISOString(),
            });
            if (orderData === null || orderData === void 0 ? void 0 : orderData.sellerId) {
                await fetch('/api/notifications/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: orderData.sellerId,
                        title: '✅ Commande livrée',
                        body: `${orderData.userName || 'Le client'} a confirmé la réception de sa commande #${orderData.orderNumber || orderId.slice(-8)}`,
                        link: '/seller/orders',
                    }),
                });
                console.log('✅ Notification vendeur livraison envoyée');
            }
            alert('🎉 Merci ! Votre confirmation a été enregistrée.');
        }
        catch (err) {
            console.error(err);
            alert('Erreur lors de la confirmation.');
        }
        finally {
            setUpdating(null);
        }
    };
    const formatDate = (date) => {
        if (!date)
            return 'Date inconnue';
        if (date === null || date === void 0 ? void 0 : date.toDate)
            return date.toDate().toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
            });
        return date;
    };
    const getStatusInfo = (status) => {
        const map = {
            en_attente: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700', icon: <lucide_react_1.Clock size={14} className="mr-1"/> },
            en_preparation: { label: 'En préparation', color: 'bg-blue-100 text-blue-700', icon: <lucide_react_1.Package size={14} className="mr-1"/> },
            expediee: { label: 'Expédiée', color: 'bg-purple-100 text-purple-700', icon: <lucide_react_1.Truck size={14} className="mr-1"/> },
            livree: { label: 'Livrée', color: 'bg-green-100 text-green-700', icon: <lucide_react_1.CheckCircle size={14} className="mr-1"/> },
            annulee: { label: 'Annulée', color: 'bg-red-100 text-red-700', icon: <lucide_react_1.XCircle size={14} className="mr-1"/> },
        };
        return map[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: <></> };
    };
    if (loading)
        return (<div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-gray-500">Chargement de vos commandes…</p>
      </div>
    </div>);
    return (<div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <link_1.default href="/account" className="flex items-center gap-2 text-gray-600 hover:text-emerald-600 transition">
            <lucide_react_1.ArrowLeft size={20}/><span className="font-medium">Mon compte</span>
          </link_1.default>
          <h1 className="text-xl font-bold text-gray-900">📦 Mes commandes</h1>
          <div className="w-20"/>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {orders.length === 0 ? (<div className="bg-white rounded-2xl p-10 text-center shadow-sm mt-4">
            <div className="text-6xl mb-4">📦</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Aucune commande</h2>
            <p className="text-gray-500 text-sm mb-6">Vous n'avez pas encore passé de commande.</p>
            <link_1.default href="/main/products">
              <button className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition">
                Découvrir les produits
              </button>
            </link_1.default>
          </div>) : (<div className="space-y-4 mt-4">
            {orders.map((order) => {
                var _a, _b, _c, _d, _e;
                const statusInfo = getStatusInfo(order.status);
                const canCancel = ['en_attente', 'en_preparation'].includes(order.status);
                const canConfirm = order.status === 'expediee';
                const canTrack = order.status === 'expediee'; // ✅ Ajout du suivi
                const isUpdating = updating === order.firestoreId;
                const cancelledBySeller = order.status === 'annulee' && order.cancelledBy === 'seller';
                const cancelledByClient = order.status === 'annulee' && order.cancelledBy === 'client';
                return (<div key={order.firestoreId} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition border border-gray-100">

                  {/* En-tête */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-gray-900">
                        Commande #{order.orderNumber || ((_a = order.id) === null || _a === void 0 ? void 0 : _a.slice(-8).toUpperCase())}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(order.createdAt)}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center ${statusInfo.color}`}>
                      {statusInfo.icon}{statusInfo.label}
                    </div>
                  </div>

                  {/* ── Annulée par le VENDEUR → bandeau d'alerte ── */}
                  {cancelledBySeller && (<div className="mb-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                      <lucide_react_1.AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5"/>
                      <div>
                        <p className="text-sm font-bold text-rose-700">Commande refusée par le vendeur</p>
                        <p className="text-xs text-rose-500 mt-0.5">
                          Le vendeur n'a pas pu traiter votre commande. Vous pouvez en passer une nouvelle ci-dessous.
                        </p>
                      </div>
                    </div>)}

                  {/* ── Annulée par le CLIENT → message neutre ── */}
                  {cancelledByClient && (<div className="mb-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2">
                      <lucide_react_1.XCircle size={15} className="text-gray-400 shrink-0"/>
                      <p className="text-xs text-gray-500 font-medium">Vous avez annulé cette commande.</p>
                    </div>)}

                  {/* Produits */}
                  <div className="border-t border-gray-100 pt-3 mt-2 space-y-2">
                    {(_b = order.items) === null || _b === void 0 ? void 0 : _b.map((item, idx) => (<div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.quantity}x {item.productName}</span>
                        <span className="font-medium text-gray-800">{(item.price * item.quantity).toLocaleString()} FCFA</span>
                      </div>))}
                  </div>

                  {/* Total + actions */}
                  <div className="border-t border-gray-100 pt-3 mt-3">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="font-bold text-emerald-600 text-lg">{(_c = order.total) === null || _c === void 0 ? void 0 : _c.toLocaleString()} FCFA</p>
                      </div>
                      {order.status === 'livree' && (<div className="flex items-center gap-1 text-green-600 text-xs font-medium bg-green-50 px-3 py-1 rounded-full">
                          <lucide_react_1.CheckCircle size={12}/>Livrée
                        </div>)}
                    </div>

                    {/* Suivi de livraison */}
                    {order.deliverySteps && (<div className="mt-4">
                        <DeliveryTracker_1.default steps={deliveryTracking_1.DELIVERY_STEPS.map((step, idx) => {
                            var _a, _b;
                            return (Object.assign(Object.assign({}, step), { completed: ((_a = order.deliverySteps[step.label.toLowerCase().replace(/ /g, '_').replace(/[^a-z_]/g, '')]) === null || _a === void 0 ? void 0 : _a.completed) || false, timestamp: ((_b = order.deliverySteps[step.label.toLowerCase().replace(/ /g, '_').replace(/[^a-z_]/g, '')]) === null || _b === void 0 ? void 0 : _b.timestamp) || null }));
                        })} currentStatus={order.deliveryStatus || 'pending'} estimatedDate={order.estimatedDelivery}/>
                      </div>)}

                    {/* Carte de livraison */}
                    {((_d = order.sellerLocation) === null || _d === void 0 ? void 0 : _d.lat) && ((_e = order.customerLocation) === null || _e === void 0 ? void 0 : _e.lat) && (<div className="mt-4 pt-4 border-t border-gray-100">
                        <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                          🗺️ Parcours de livraison
                        </h4>
                        <DeliveryMap_1.default pickupLocation={{
                            lat: order.sellerLocation.lat,
                            lng: order.sellerLocation.lng,
                            address: order.sellerLocation.address || 'Boutique du vendeur',
                        }} deliveryLocation={{
                            lat: order.customerLocation.lat,
                            lng: order.customerLocation.lng,
                            address: order.customerLocation.address || 'Votre adresse',
                        }}/>
                      </div>)}

                    {/* ✅ NOUVEAU : Boutons avec suivi */}
                    <div className="flex gap-3">
                      {canCancel && (<button onClick={() => handleCancelOrder(order.firestoreId)} disabled={isUpdating} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50">
                          {isUpdating
                            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                            : <lucide_react_1.XCircle size={16}/>}
                          {isUpdating ? 'En cours…' : 'Annuler la commande'}
                        </button>)}

                      {/* ✅ BOUTON SUIVI AJOUTÉ ICI */}
                      {canTrack && (<link_1.default href={`/tracking/${order.firestoreId}`} className="flex-1">
                          <button className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition">
                            <lucide_react_1.MapPin size={16}/>
                            Suivre mon colis
                          </button>
                        </link_1.default>)}

                      {canConfirm && (<button onClick={() => handleConfirmDelivery(order.firestoreId)} disabled={isUpdating} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50">
                          <lucide_react_1.CheckCircle size={16}/>Confirmer réception
                        </button>)}

                      {order.status === 'annulee' && (<link_1.default href="/main/products" className="flex-1">
                          <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition">
                            <lucide_react_1.Package size={16}/>Commander à nouveau
                          </button>
                        </link_1.default>)}
                    </div>
                  </div>
                </div>);
            })}
          </div>)}
      </div>
    </div>);
}
