// /app/admin/assign-delivery/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Truck, User, MapPin, Phone, CheckCircle, XCircle, Search, Loader2 } from 'lucide-react';

interface DeliveryPerson {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  role: string;
  vehicle?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  userName: string;
  userPhone: string;
  amount: number;
  status: string;
  customerLocation: { address: string };
  deliveryPerson?: { id: string; name: string; phone?: string; };
}

export default function AssignDeliveryPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Vérification admin
  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) {
      router.push('/');
    }
  }, [authLoading, user, profile, router]);

  // Charger les commandes non assignées ou en livraison
  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', 'in', ['en_preparation', 'expediee']));
    const unsub = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      setOrders(ordersData);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Charger les livreurs disponibles
  useEffect(() => {
    const loadDeliveryPersons = async () => {
      const q = query(collection(db, 'users'), where('role', '==', 'delivery'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DeliveryPerson[];
      setDeliveryPersons(data);
    };
    loadDeliveryPersons();
  }, []);

  const assignDeliveryPerson = async (orderId: string, deliveryPerson: DeliveryPerson) => {
    setAssigning(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
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
    } catch (error) {
      console.error(error);
      alert('Erreur lors de l\'assignation');
    } finally {
      setAssigning(null);
    }
  };

  const unassignDeliveryPerson = async (orderId: string) => {
    if (!confirm('Retirer le livreur de cette commande ?')) return;
    setAssigning(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        deliveryPerson: null,
        'tracking.enabled': false,
      });
      alert('✅ Livreur retiré');
    } catch (error) {
      console.error(error);
      alert('Erreur');
    } finally {
      setAssigning(null);
    }
  };

  const filteredOrders = orders.filter(order =>
    order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.userName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-emerald-600 mx-auto mb-3" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user || profile?.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-5 text-white mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Truck size={22} /> Assigner un livreur
          </h1>
          <p className="text-emerald-100 text-sm">Affectez un livreur aux commandes prêtes</p>
        </div>

        {/* Recherche */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par numéro de commande ou client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
          />
        </div>

        {/* Liste des commandes */}
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
              <Truck size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Aucune commande à assigner</p>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                {/* En-tête commande */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-gray-800">#{order.orderNumber || order.id.slice(-8)}</p>
                    <p className="text-sm text-gray-600">{order.userName}</p>
                    <p className="text-xs text-gray-400">{order.customerLocation?.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-600">{order.amount?.toLocaleString()} FCFA</p>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      order.status === 'expediee' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {order.status === 'expediee' ? 'En livraison' : 'Prête'}
                    </span>
                  </div>
                </div>

                {/* Livreur actuel */}
                {order.deliveryPerson && (
                  <div className="mb-4 p-3 bg-emerald-50 rounded-xl">
                    <p className="text-xs font-semibold text-emerald-600 mb-1">Livreur assigné</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-emerald-600" />
                        <span className="font-medium text-gray-800">{order.deliveryPerson.name}</span>
                        <span className="text-xs text-gray-500">{order.deliveryPerson.phone}</span>
                      </div>
                      <button
                        onClick={() => unassignDeliveryPerson(order.id)}
                        disabled={assigning === order.id}
                        className="px-3 py-1 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                      >
                        {assigning === order.id ? '...' : 'Retirer'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Sélection livreur */}
                {!order.deliveryPerson && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">Assigner un livreur :</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {deliveryPersons.map((delivery) => (
                        <button
                          key={delivery.id}
                          onClick={() => assignDeliveryPerson(order.id, delivery)}
                          disabled={assigning === order.id}
                          className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50 transition text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                            <User size={14} className="text-emerald-600" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-800 text-sm">{delivery.displayName}</p>
                            <p className="text-xs text-gray-400">{delivery.phone}</p>
                          </div>
                          {assigning === order.id ? (
                            <Loader2 size={14} className="animate-spin text-emerald-600" />
                          ) : (
                            <CheckCircle size={14} className="text-gray-300" />
                          )}
                        </button>
                      ))}
                    </div>
                    {deliveryPersons.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-3">
                        Aucun livreur disponible. Ajoutez un livreur avec le rôle "delivery".
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}