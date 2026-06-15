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
  Truck,
  Crown,
  Loader2,
} from 'lucide-react';

interface Order {
  id: number;
  product: string;
  price: string;
  quantity: string;
  seller: string;
  date: string;
  status: 'en_cours' | 'livree' | 'annulee';
}

interface UserFormData {
  displayName: string;
  phone: string;
  city: string;
  address: string;
}

export default function AccountPage() {

  const {
    user,
    profile,
    loading,
    logout,
    updateUserProfile,
  } = useAuth();

  const router = useRouter();

  const [isEditing, setIsEditing] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [saveSuccess, setSaveSuccess] =
    useState(false);

  const [formData, setFormData] =
    useState<UserFormData>({
      displayName: '',
      phone: '',
      city: '',
      address: '',
    });

  // ====================================================
  // COMMANDES FAKE TEMPORAIRES
  // ====================================================

  const [orders, setOrders] =
    useState<Order[]>([
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
        status: 'livree',
      },
    ]);

  // ====================================================
  // PROTECTION PAGE
  // ====================================================

  useEffect(() => {

    if (!loading && !user) {

      router.push('/auth/login');

    }

  }, [loading, user, router]);

  // ====================================================
  // CHARGER PROFIL
  // ====================================================

  useEffect(() => {

    if (profile) {

      setFormData({
        displayName:
          profile.displayName || '',

        phone:
          profile.phone || '',

        city:
          profile?.sellerInfo?.city || '',

        address:
          profile?.sellerInfo?.shopName || '',
      });

    }

  }, [profile]);

  // ====================================================
  // LOADING
  // ====================================================

  if (loading) {

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-100">

        <div className="text-center">

          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />

          <p className="text-gray-500 font-medium">
            Chargement du compte...
          </p>

        </div>

      </div>
    );

  }

  if (!user) return null;

  // ====================================================
  // SAVE PROFILE
  // ====================================================

  const handleSave = async () => {

    try {

      setSaving(true);

      await updateUserProfile({
        displayName:
          formData.displayName,

        phone:
          formData.phone,
      });

      setSaveSuccess(true);

      setIsEditing(false);

      setTimeout(() => {

        setSaveSuccess(false);

      }, 3000);

    } catch (error) {

      console.error(error);

    } finally {

      setSaving(false);

    }

  };

  // ====================================================
  // LOGOUT
  // ====================================================

  const handleLogout = async () => {

    await logout();

    router.push('/');

  };

  // ====================================================
  // COMMANDES
  // ====================================================

  const handleConfirmOrder = (
    orderId: number
  ) => {

    setOrders(
      orders.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status: 'livree',
            }
          : order
      )
    );

  };

  const handleCancelOrder = (
    orderId: number
  ) => {

    const confirmed = confirm(
      'Annuler cette commande ?'
    );

    if (!confirmed) return;

    setOrders(
      orders.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status: 'annulee',
            }
          : order
      )
    );

  };

  // ====================================================
  // STATS
  // ====================================================

  const stats = {
    total: orders.length,

    enCours:
      orders.filter(
        (o) => o.status === 'en_cours'
      ).length,

    livrees:
      orders.filter(
        (o) => o.status === 'livree'
      ).length,

    annulees:
      orders.filter(
        (o) => o.status === 'annulee'
      ).length,
  };

  // ====================================================
  // ROLE
  // ====================================================

  const userRole =
    profile?.role || 'client';

  const isSeller =
    userRole === 'seller' ||
    userRole === 'both' ||
    userRole === 'admin';

  // ====================================================
  // PAGE
  // ====================================================

  return (

    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-100 py-8 px-4 md:py-12">

      <div className="max-w-5xl mx-auto space-y-6">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">

          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 md:p-8 relative overflow-hidden">

            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32" />

            <div className="flex flex-col md:flex-row items-center gap-5 relative z-10">

              {/* AVATAR */}

              <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-4xl font-bold ring-4 ring-white/30 shadow-lg">

                {user.email?.charAt(0).toUpperCase()}

              </div>

              {/* INFOS */}

              <div className="text-center md:text-left">

                <h1 className="text-2xl md:text-3xl font-black text-white">

                  {formData.displayName || 'Utilisateur'}

                </h1>

                <p className="text-green-100 text-sm">

                  {user.email}

                </p>

                {/* ROLE */}

                <div className="flex flex-wrap items-center gap-2 mt-3">

                  <div className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">

                    <Shield size={12} />

                    {userRole.toUpperCase()}

                  </div>

                  {isSeller && (

                    <div className="bg-yellow-400 text-black px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">

                      <Crown size={12} />

                      VENDEUR ACTIF

                    </div>

                  )}

                </div>

              </div>

            </div>

          </div>

          {/* ================================================= */}
          {/* INFOS PERSONNELLES */}
          {/* ================================================= */}

          <div className="p-6 md:p-8">

            <div className="flex justify-between items-center mb-6">

              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">

                <User
                  size={20}
                  className="text-green-600"
                />

                Informations personnelles

              </h2>

              {!isEditing && (

                <button
                  onClick={() =>
                    setIsEditing(true)
                  }
                  className="flex items-center gap-2 text-green-600 font-semibold hover:text-green-700"
                >

                  <Edit2 size={16} />

                  Modifier

                </button>

              )}

            </div>

            {/* SUCCESS */}

            {saveSuccess && (

              <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-xl flex items-center gap-2 border-l-4 border-green-600">

                <CheckCircle size={18} />

                Profil mis à jour

              </div>

            )}

            {/* ================================================= */}
            {/* MODE EDIT */}
            {/* ================================================= */}

            {isEditing ? (

              <div className="space-y-4">

                <input
                  type="text"
                  placeholder="Nom complet"
                  value={formData.displayName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      displayName:
                        e.target.value,
                    })
                  }
                  className="w-full border border-gray-200 rounded-xl px-4 py-3"
                />

                <input
                  type="tel"
                  placeholder="Téléphone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      phone:
                        e.target.value,
                    })
                  }
                  className="w-full border border-gray-200 rounded-xl px-4 py-3"
                />

                <div className="flex gap-3">

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
                  >

                    {saving ? (

                      <Loader2 className="w-4 h-4 animate-spin" />

                    ) : (

                      <Save size={16} />

                    )}

                    Sauvegarder

                  </button>

                  <button
                    onClick={() =>
                      setIsEditing(false)
                    }
                    className="flex-1 border border-gray-300 py-3 rounded-xl"
                  >

                    Annuler

                  </button>

                </div>

              </div>

            ) : (

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">

                  <User
                    size={18}
                    className="text-green-600"
                  />

                  <span>

                    {formData.displayName ||
                      'Non renseigné'}

                  </span>

                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">

                  <Mail
                    size={18}
                    className="text-green-600"
                  />

                  <span>

                    {user.email}

                  </span>

                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">

                  <Phone
                    size={18}
                    className="text-green-600"
                  />

                  <span>

                    {formData.phone ||
                      'Non renseigné'}

                  </span>

                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">

                  <Shield
                    size={18}
                    className="text-green-600"
                  />

                  <span>

                    Rôle : {userRole}

                  </span>

                </div>

              </div>

            )}

          </div>

        </div>

        {/* ================================================= */}
        {/* STATS */}
        {/* ================================================= */}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          <div className="bg-white rounded-2xl p-4 shadow">

            <p className="text-2xl font-bold">
              {stats.total}
            </p>

            <p className="text-gray-500 text-sm">
              Commandes
            </p>

          </div>

          <div className="bg-white rounded-2xl p-4 shadow">

            <p className="text-2xl font-bold text-yellow-600">
              {stats.enCours}
            </p>

            <p className="text-gray-500 text-sm">
              En cours
            </p>

          </div>

          <div className="bg-white rounded-2xl p-4 shadow">

            <p className="text-2xl font-bold text-green-600">
              {stats.livrees}
            </p>

            <p className="text-gray-500 text-sm">
              Livrées
            </p>

          </div>

          <div className="bg-white rounded-2xl p-4 shadow">

            <p className="text-2xl font-bold text-red-600">
              {stats.annulees}
            </p>

            <p className="text-gray-500 text-sm">
              Annulées
            </p>

          </div>

        </div>

        {/* ================================================= */}
        {/* COMMANDES */}
        {/* ================================================= */}

        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8">

          <div className="flex justify-between items-center mb-6">

            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">

              <Package
                size={20}
                className="text-green-600"
              />

              Mes commandes

            </h2>

            <Link
              href="/account/orders"
              className="text-green-600 text-sm font-medium flex items-center gap-1"
            >

              Voir tout

              <ChevronRight size={14} />

            </Link>

          </div>

          <div className="space-y-4">

            {orders.map((order) => (

              <div
                key={order.id}
                className="bg-gray-50 rounded-2xl p-4"
              >

                <div className="flex justify-between items-start gap-4 mb-4">

                  <div>

                    <p className="font-bold text-lg">

                      {order.product}

                    </p>

                    <p className="text-sm text-gray-500">

                      {order.seller}

                    </p>

                    <p className="text-green-700 font-bold mt-2">

                      {order.price}

                    </p>

                  </div>

                  {/* STATUS */}

                  {order.status ===
                    'en_cours' && (

                    <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-semibold">

                      En attente

                    </span>

                  )}

                  {order.status ===
                    'livree' && (

                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">

                      Livrée

                    </span>

                  )}

                  {order.status ===
                    'annulee' && (

                    <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">

                      Annulée

                    </span>

                  )}

                </div>

                {/* ACTIONS */}

                {order.status ===
                  'en_cours' && (

                  <div className="flex gap-3">

                    <button
                      onClick={() =>
                        handleConfirmOrder(
                          order.id
                        )
                      }
                      className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold"
                    >

                      Confirmer

                    </button>

                    <button
                      onClick={() =>
                        handleCancelOrder(
                          order.id
                        )
                      }
                      className="flex-1 bg-red-500 text-white py-3 rounded-xl font-semibold"
                    >

                      Annuler

                    </button>

                  </div>

                )}

                {order.status ===
                  'annulee' && (

                  <button className="w-full border-2 border-green-600 text-green-600 py-3 rounded-xl font-semibold mt-3">

                    Recommander

                  </button>

                )}

              </div>

            ))}

          </div>

        </div>

        {/* ================================================= */}
        {/* ACTIONS */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* DEVENIR VENDEUR */}

          {!isSeller ? (

            <Link
              href="/seller/register"
              className="bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2"
            >

              <Store size={18} />

              Devenir vendeur

            </Link>

          ) : (

            <Link
              href="/seller/dashboard"
              className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2"
            >

              <Crown size={18} />

              Accéder à ma boutique

            </Link>

          )}

          {/* LOGOUT */}

          <button
            onClick={handleLogout}
            className="bg-white border border-red-200 text-red-600 py-4 rounded-2xl font-semibold shadow-sm flex items-center justify-center gap-2"
          >

            <LogOut size={18} />

            Déconnexion

          </button>

        </div>

      </div>

    </div>

  );

}