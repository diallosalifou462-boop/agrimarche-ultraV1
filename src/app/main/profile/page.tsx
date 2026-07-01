'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

import {
  User,
  Mail,
  Phone,
  MapPin,
  Package,
  ShoppingBag,
  Heart,
  LogOut,
  Edit2,
  Save,
  Clock,
  CheckCircle,
  Store,
  ChevronRight,
  XCircle,
  RefreshCw,
  Star,
  Shield,
} from 'lucide-react';

export default function AccountPage() {
  const { user, loading, logout, profile } = useAuth();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    phone: '',
    city: '',
    address: '',
  });

  // Commandes avec 3 statuts différents
  const [orders, setOrders] = useState([
    {
      id: 1,
      product: 'Mangues Bio',
      price: '3 500 CFA',
      quantity: '2 kg',
      seller: 'Ferme de Dakar',
      date: '24 Mai 2026',
      status: 'en_cours',
    },
    {
      id: 2,
      product: 'Riz local',
      price: '12 000 CFA',
      quantity: '5 kg',
      seller: 'Riziculture Nord',
      date: '20 Mai 2026',
      status: 'livre',
    },
    {
      id: 3,
      product: 'Tomates Fraîches',
      price: '800 CFA',
      quantity: '1 kg',
      seller: 'Maraîchers Bio',
      date: '18 Mai 2026',
      status: 'annule',
    },
  ]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      setFormData({
        displayName: user.displayName || '',
        phone: profile?.phone || '', // ✅ Correction : utiliser profile.phone
        city: profile?.city || '',
        address: profile?.address || '',
      });
    }
  }, [user, profile]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur mise à jour:', error);
    } finally {
      setSaving(false);
    }
  };

  // Gestion des actions commandes
  const handleConfirmOrder = (orderId: number) => {
    setOrders(orders.map(order => 
      order.id === orderId ? { ...order, status: 'livre' } : order
    ));
    alert(`✅ Commande ${orderId} confirmée !`);
  };

  const handleCancelOrder = (orderId: number) => {
    setOrders(orders.map(order => 
      order.id === orderId ? { ...order, status: 'annule' } : order
    ));
    alert(`❌ Commande ${orderId} annulée`);
  };

  const handleReorder = (orderId: number) => {
    router.push('/main/products');
  };

  const handleLeaveReview = (orderId: number) => {
    alert('⭐ Merci de partager votre expérience !');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-100 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden mb-6 transition-all hover:shadow-2xl">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mb-24" />
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-4xl font-bold ring-4 ring-white/30">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <div className="text-white">
                <h1 className="text-3xl font-black">{user.displayName || 'Utilisateur'}</h1>
                <p className="text-green-100 text-sm">{user.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
                  <span className="text-sm text-green-100">Client AgriMarché</span>
                  <Shield size={12} className="text-green-300 ml-1" />
                </div>
              </div>
            </div>
          </div>

          {/* INFOS */}
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <User size={20} className="text-green-600" />
                Informations personnelles
              </h2>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 text-green-600 font-semibold hover:text-green-700 transition-colors"
                >
                  <Edit2 size={16} />
                  Modifier
                </button>
              )}
            </div>

            {saveSuccess && (
              <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-xl text-sm flex items-center gap-2 animate-fade-in">
                <CheckCircle size={16} />
                Profil mis à jour avec succès !
              </div>
            )}

            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
                  <input
                    type="text"
                    placeholder="Votre nom"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    placeholder="+221 77 000 00 00"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                  <input
                    type="text"
                    placeholder="Dakar, Thiès..."
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                  <input
                    type="text"
                    placeholder="Rue, numéro, quartier"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200 transition"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition disabled:opacity-50"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="border border-gray-300 px-6 py-3 rounded-xl hover:bg-gray-50 transition"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-green-50 transition-colors">
                  <User size={18} className="text-green-600" />
                  <span className="text-gray-700">{user.displayName || 'Non renseigné'}</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-green-50 transition-colors">
                  <Mail size={18} className="text-green-600" />
                  <span className="text-gray-700">{user.email}</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-green-50 transition-colors">
                  <Phone size={18} className="text-green-600" />
                  <span className="text-gray-700">{formData.phone || 'Non renseigné'}</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-green-50 transition-colors">
                  <MapPin size={18} className="text-green-600" />
                  <span className="text-gray-700">
                    {formData.city || formData.address 
                      ? `${formData.city || ''} ${formData.address ? `- ${formData.address}` : ''}`.trim()
                      : 'Non renseignée'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 shadow hover:shadow-lg transition-all hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <ShoppingBag size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{orders.length}</p>
                <p className="text-gray-500 text-sm">Commandes</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow hover:shadow-lg transition-all hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Heart size={18} className="text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">0</p>
                <p className="text-gray-500 text-sm">Favoris</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow hover:shadow-lg transition-all hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Store size={18} className="text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-800">Client</p>
                <p className="text-gray-500 text-sm">Statut</p>
              </div>
            </div>
          </div>
        </div>

        {/* COMMANDES avec système complet de statuts */}
        <div className="bg-white rounded-3xl shadow-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Package size={20} className="text-green-600" />
              Mes commandes
            </h2>
            <Link href="/account/orders" className="text-green-600 text-sm font-medium flex items-center gap-1 hover:text-green-700">
              Voir tout <ChevronRight size={14} />
            </Link>
          </div>
          
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-gray-50 rounded-2xl p-4 hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-lg text-gray-800">
                      {order.product}
                    </p>
                    <div className="flex gap-3 text-xs text-gray-500 mt-1">
                      <span>{order.quantity}</span>
                      <span>{order.seller}</span>
                      <span>{order.date}</span>
                    </div>
                    <p className="text-green-700 font-bold mt-2">
                      {order.price}
                    </p>
                  </div>
                  
                  {/* STATUTS 3 ÉTATS */}
                  {order.status === 'en_cours' && (
                    <span className="bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1">
                      <Clock size={14} />
                      En attente
                    </span>
                  )}
                  {order.status === 'livre' && (
                    <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1">
                      <CheckCircle size={14} />
                      Livrée
                    </span>
                  )}
                  {order.status === 'annule' && (
                    <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1">
                      <XCircle size={14} />
                      Annulée
                    </span>
                  )}
                </div>
                
                {/* BOUTONS D'ACTION - Uniquement pour les commandes en attente */}
                {order.status === 'en_cours' && (
                  <div className="flex gap-3 mt-3 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => handleConfirmOrder(order.id)}
                      className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                    >
                      <CheckCircle size={16} />
                      Confirmer la livraison
                    </button>
                    <button
                      onClick={() => handleCancelOrder(order.id)}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                    >
                      <XCircle size={16} />
                      Annuler la commande
                    </button>
                  </div>
                )}
                
                {/* BOUTON RECOMMANDER - Pour les commandes annulées */}
                {order.status === 'annule' && (
                  <div className="mt-3 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => handleReorder(order.id)}
                      className="w-full border-2 border-green-600 text-green-600 hover:bg-green-50 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw size={16} />
                      Commander à nouveau
                    </button>
                  </div>
                )}
                
                {/* BOUTON AVIS - Pour les commandes livrées */}
                {order.status === 'livre' && (
                  <div className="mt-3 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => handleLeaveReview(order.id)}
                      className="w-full border-2 border-yellow-500 text-yellow-600 hover:bg-yellow-50 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <Star size={16} />
                      Laisser un avis
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* BOUTONS ACTIONS */}
        <div className="grid grid-cols-1 gap-3">
          <Link
            href="/become-seller"
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all"
          >
            <Store size={18} />
            Devenir vendeur
          </Link>
          <button
            onClick={handleLogout}
            className="w-full bg-white border border-red-200 hover:bg-red-50 text-red-600 py-4 rounded-2xl font-semibold shadow-sm flex items-center justify-center gap-2 transition-all"
          >
            <LogOut size={18} />
            Déconnexion
          </button>
        </div>

        {/* Version App */}
        <p className="text-center text-xs text-gray-400 mt-6">
          AgriMarché v2.0 — ©️ 2024
        </p>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
