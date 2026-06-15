"use strict";
// /app/admin/assign-delivery/page.tsx
'use client';
// /app/admin/assign-delivery/page.tsx
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AssignDeliveryPage;
const react_1 = require("react");
const useAuth_1 = require("@/hooks/useAuth");
const navigation_1 = require("next/navigation");
const firebase_1 = require("@/lib/firebase/firebase");
const firestore_1 = require("firebase/firestore");
const lucide_react_1 = require("lucide-react");
function AssignDeliveryPage() {
    const { user, profile, loading: authLoading } = (0, useAuth_1.useAuth)();
    const router = (0, navigation_1.useRouter)();
    const [orders, setOrders] = (0, react_1.useState)([]);
    const [deliveryPersons, setDeliveryPersons] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [assigning, setAssigning] = (0, react_1.useState)(null);
    const [searchTerm, setSearchTerm] = (0, react_1.useState)('');
    // Vérification admin
    (0, react_1.useEffect)(() => {
        if (!authLoading && (!user || (profile === null || profile === void 0 ? void 0 : profile.role) !== 'admin')) {
            router.push('/');
        }
    }, [authLoading, user, profile, router]);
    // Charger les commandes non assignées ou en livraison
    (0, react_1.useEffect)(() => {
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'orders'), (0, firestore_1.where)('status', 'in', ['en_preparation', 'expediee']));
        const unsub = (0, firestore_1.onSnapshot)(q, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            setOrders(ordersData);
            setLoading(false);
        });
        return () => unsub();
    }, []);
    // Charger les livreurs disponibles
    (0, react_1.useEffect)(() => {
        const loadDeliveryPersons = async () => {
            const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'users'), (0, firestore_1.where)('role', '==', 'delivery'));
            const snapshot = await (0, firestore_1.getDocs)(q);
            const data = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            setDeliveryPersons(data);
        };
        loadDeliveryPersons();
    }, []);
    const assignDeliveryPerson = async (orderId, deliveryPerson) => {
        setAssigning(orderId);
        try {
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'orders', orderId), {
                deliveryPerson: {
                    id: deliveryPerson.id,
                    name: deliveryPerson.displayName,
                    phone: deliveryPerson.phone,
                    vehicle: deliveryPerson.vehicle || 'Moto',
                },
                'tracking.enabled': true,
                'tracking.currentLocation': null,
                'tracking.lastUpdate': null,
            });
            alert(`✅ Livreur ${deliveryPerson.displayName} assigné à la commande`);
        }
        catch (error) {
            console.error(error);
            alert('Erreur lors de l\'assignation');
        }
        finally {
            setAssigning(null);
        }
    };
    const unassignDeliveryPerson = async (orderId) => {
        if (!confirm('Retirer le livreur de cette commande ?'))
            return;
        setAssigning(orderId);
        try {
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'orders', orderId), {
                deliveryPerson: null,
                'tracking.enabled': false,
            });
            alert('✅ Livreur retiré');
        }
        catch (error) {
            console.error(error);
            alert('Erreur');
        }
        finally {
            setAssigning(null);
        }
    };
    const filteredOrders = orders.filter(order => {
        var _a, _b;
        return ((_a = order.orderNumber) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(searchTerm.toLowerCase())) ||
            ((_b = order.userName) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(searchTerm.toLowerCase()));
    });
    if (authLoading || loading) {
        return (<div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <lucide_react_1.Loader2 size={40} className="animate-spin text-emerald-600 mx-auto mb-3"/>
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>);
    }
    if (!user || (profile === null || profile === void 0 ? void 0 : profile.role) !== 'admin')
        return null;
    return (<div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-5 text-white mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <lucide_react_1.Truck size={22}/> Assigner un livreur
          </h1>
          <p className="text-emerald-100 text-sm">Affectez un livreur aux commandes prêtes</p>
        </div>

        {/* Recherche */}
        <div className="relative mb-6">
          <lucide_react_1.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input type="text" placeholder="Rechercher par numéro de commande ou client..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"/>
        </div>

        {/* Liste des commandes */}
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (<div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
              <lucide_react_1.Truck size={48} className="mx-auto text-gray-300 mb-3"/>
              <p className="text-gray-500">Aucune commande à assigner</p>
            </div>) : (filteredOrders.map((order) => {
            var _a, _b;
            return (<div key={order.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                {/* En-tête commande */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-gray-800">#{order.orderNumber || order.id.slice(-8)}</p>
                    <p className="text-sm text-gray-600">{order.userName}</p>
                    <p className="text-xs text-gray-400">{(_a = order.customerLocation) === null || _a === void 0 ? void 0 : _a.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-600">{(_b = order.amount) === null || _b === void 0 ? void 0 : _b.toLocaleString()} FCFA</p>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${order.status === 'expediee' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {order.status === 'expediee' ? 'En livraison' : 'Prête'}
                    </span>
                  </div>
                </div>

                {/* Livreur actuel */}
                {order.deliveryPerson && (<div className="mb-4 p-3 bg-emerald-50 rounded-xl">
                    <p className="text-xs font-semibold text-emerald-600 mb-1">Livreur assigné</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <lucide_react_1.User size={16} className="text-emerald-600"/>
                        <span className="font-medium text-gray-800">{order.deliveryPerson.name}</span>
                        <span className="text-xs text-gray-500">{order.deliveryPerson.phone}</span>
                      </div>
                      <button onClick={() => unassignDeliveryPerson(order.id)} disabled={assigning === order.id} className="px-3 py-1 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition">
                        {assigning === order.id ? '...' : 'Retirer'}
                      </button>
                    </div>
                  </div>)}

                {/* Sélection livreur */}
                {!order.deliveryPerson && (<div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">Assigner un livreur :</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {deliveryPersons.map((delivery) => (<button key={delivery.id} onClick={() => assignDeliveryPerson(order.id, delivery)} disabled={assigning === order.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50 transition text-left">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                            <lucide_react_1.User size={14} className="text-emerald-600"/>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-800 text-sm">{delivery.displayName}</p>
                            <p className="text-xs text-gray-400">{delivery.phone}</p>
                          </div>
                          {assigning === order.id ? (<lucide_react_1.Loader2 size={14} className="animate-spin text-emerald-600"/>) : (<lucide_react_1.CheckCircle size={14} className="text-gray-300"/>)}
                        </button>))}
                    </div>
                    {deliveryPersons.length === 0 && (<p className="text-sm text-gray-400 text-center py-3">
                        Aucun livreur disponible. Ajoutez un livreur avec le rôle "delivery".
                      </p>)}
                  </div>)}
              </div>);
        }))}
        </div>
      </div>
    </div>);
}
