'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import {
  Store,
  Phone,
  MapPin,
  CheckCircle,
  ArrowLeft,
  TrendingUp,
  Users,
  Package,
  Truck,
  Shield,
  Star,
  Mail,
  AlertCircle,
  ChevronRight,
  DollarSign,
  ShoppingBag,
  ThumbsUp,
  Plus,
  Edit,
  Trash2,
  BarChart3,
  Download,
  Settings,
  Headphones,
  MessageCircle,
  Send,
  Sparkles,
  Crown,
  Navigation,
  Clock3,
} from 'lucide-react';

type FormErrors = {
  shopName?: string;
  phone?: string;
  city?: string;
  email?: string;
};

export default function BecomeSellerPage() {
  const [activeTab, setActiveTab] = useState('form');
  const [submitted, setSubmitted] = useState(false);

  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState('');

  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  const [formData, setFormData] = useState({
    shopName: '',
    phone: '',
    city: '',
    email: '',
    productType: '',
    description: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const [stats] = useState({
    revenue: 1250000,
    orders: 47,
    products: 12,
    satisfaction: 99,
    visitors: 248,
  });

  const [products] = useState([
    {
      id: 1,
      name: 'Mangues Bio',
      price: 3500,
      stock: 50,
    },
    {
      id: 2,
      name: 'Riz local',
      price: 2400,
      stock: 100,
    },
    {
      id: 3,
      name: 'Tomates',
      price: 800,
      stock: 30,
    },
    {
      id: 4,
      name: 'Oignons',
      price: 600,
      stock: 0,
    },
  ]);

  const [recentOrders, setRecentOrders] = useState([
    {
      id: 'CMD-001',
      product: 'Mangues Bio',
      customer: 'Mamadou Diallo',
      amount: 7000,
      status: 'pending',
      date: '24 Mai 2026',
    },
    {
      id: 'CMD-002',
      product: 'Riz local',
      customer: 'Fatou Sow',
      amount: 12000,
      status: 'delivered',
      date: '23 Mai 2026',
    },
    {
      id: 'CMD-003',
      product: 'Tomates',
      customer: 'Aliou Ndiaye',
      amount: 2400,
      status: 'shipped',
      date: '23 Mai 2026',
    },
  ]);

  const [conversations, setConversations] = useState([
    {
      id: 1,
      customerName: 'Mamadou Diallo',
      customerPhone: '+221779747073',
      customerAvatar: 'MD',
      unread: 2,
      lastMessage: 'Bonjour, quand sera livrée ma commande ?',
      lastMessageTime: '10:30',
      messages: [
        {
          id: 1,
          sender: 'customer',
          text: 'Bonjour, quand sera livrée ma commande ?',
          time: '10:30',
        },
        {
          id: 2,
          sender: 'seller',
          text: 'Bonjour Mamadou, livraison prévue demain matin.',
          time: '10:32',
        },
      ],
    },

    {
      id: 2,
      customerName: 'Fatou Sow',
      customerPhone: '+221772345678',
      customerAvatar: 'FS',
      unread: 0,
      lastMessage: 'Merci pour la qualité du riz.',
      lastMessageTime: 'Hier',
      messages: [
        {
          id: 1,
          sender: 'customer',
          text: 'Merci pour la qualité du riz.',
          time: 'Hier',
        },
      ],
    },
  ]);

  const currentChat = useMemo(() => {
    return conversations.find((c) => c.id === selectedChat);
  }, [selectedChat, conversations]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });

    if (errors[e.target.name as keyof FormErrors]) {
      setErrors({
        ...errors,
        [e.target.name]: '',
      });
    }
  };

  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {};

    if (!formData.shopName.trim()) {
      newErrors.shopName = 'Nom requis';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Téléphone requis';
    }
    if (!formData.city.trim()) {
      newErrors.city = 'Ville requise';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email requis';
    }

    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = validateForm();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitted(true);

    setTimeout(() => {
      setShowWhatsAppModal(true);
    }, 1200);
  };

  const updateOrderStatus = (orderId: string, newStatus: string) => {
    setRecentOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? { ...order, status: newStatus }
          : order
      )
    );
  };

  const sendMessage = () => {
    if (!messageInput.trim() || !currentChat) return;

    const updated = conversations.map((conv) => {
      if (conv.id !== currentChat.id) return conv;

      return {
        ...conv,
        messages: [
          ...conv.messages,
          {
            id: Date.now(),
            sender: 'seller',
            text: messageInput,
            time: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ],
        lastMessage: messageInput,
      };
    });

    setConversations(updated);
    setMessageInput('');
  };

  const openWhatsApp = (phone: string, message: string = '') => {
    const encoded = encodeURIComponent(message);
    window.open(
      `https://wa.me/${phone}?text=${encoded}`,
      '_blank'
    );
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      shipped: 'bg-blue-100 text-blue-700',
      delivered: 'bg-emerald-100 text-emerald-700',
      cancelled: 'bg-red-100 text-red-700',
    };

    const labels: Record<string, string> = {
      pending: 'En attente',
      shipped: 'Expédiée',
      delivered: 'Livrée',
      cancelled: 'Annulée',
    };

    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-emerald-50 to-green-50 flex items-center justify-center p-6">
        <div className="bg-white max-w-md w-full rounded-3xl p-8 shadow-2xl text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Demande envoyée
          </h1>

          <p className="text-gray-500 mb-6">
            Notre équipe analysera votre profil sous 48h.
          </p>

          <div className="bg-emerald-50 rounded-2xl p-4 mb-6">
            <p className="text-sm text-emerald-700">
              Numéro enregistré :
            </p>

            <p className="font-bold text-emerald-800 mt-1">
              {formData.phone}
            </p>
          </div>

          <button
            onClick={() => setActiveTab('dashboard')}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 text-white font-semibold hover:shadow-xl transition"
          >
            Accéder au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  if (activeTab === 'dashboard') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-emerald-50 to-green-50">

        {/* HEADER */}
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 text-white">
          <div className="max-w-7xl mx-auto px-4 py-7">
            <div className="flex justify-between items-center">

              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <Store className="w-7 h-7" />
                </div>

                <div>
                  <h1 className="text-2xl font-bold">
                    Tableau de bord vendeur
                  </h1>

                  <p className="text-emerald-100 text-sm">
                    {formData.shopName || 'Ma boutique'}
                  </p>
                </div>
              </div>

              <Link
                href="/account"
                className="p-3 rounded-xl bg-white/20 hover:bg-white/30 transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">

          {/* STATS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">

            <StatCard
              icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
              title="Revenus"
              value={`${stats.revenue.toLocaleString()} CFA`}
              subtitle="+12% ce mois"
            />

            <StatCard
              icon={<ShoppingBag className="w-5 h-5 text-blue-600" />}
              title="Commandes"
              value={stats.orders}
              subtitle="8 nouvelles"
            />

            <StatCard
              icon={<Package className="w-5 h-5 text-purple-600" />}
              title="Produits"
              value={stats.products}
              subtitle="En ligne"
            />

            <StatCard
              icon={<ThumbsUp className="w-5 h-5 text-amber-600" />}
              title="Satisfaction"
              value={`${stats.satisfaction}%`}
              subtitle="Clients satisfaits"
            />

            <StatCard
              icon={<Navigation className="w-5 h-5 text-red-600" />}
              title="Visites"
              value={stats.visitors}
              subtitle="Aujourd’hui"
            />
          </div>

          {/* PRODUITS + COMMANDES */}
          <div className="grid lg:grid-cols-3 gap-8 mb-8">

            {/* PRODUITS */}
            <div className="lg:col-span-2 bg-white rounded-3xl shadow-xl overflow-hidden">

              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-600" />
                  Mes produits
                </h2>

                <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Ajouter
                </button>
              </div>

              <div className="divide-y divide-gray-100">

                {products.map((product) => (
                  <div
                    key={product.id}
                    className="p-6 flex justify-between items-center hover:bg-emerald-50 transition"
                  >
                    <div>
                      <p className="font-semibold text-gray-800">
                        {product.name}
                      </p>

                      <p className="text-sm text-gray-500">
                        {product.price.toLocaleString()} CFA
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        Stock : {product.stock > 0 ? `${product.stock} kg` : 'Rupture'}
                      </p>

                      <div className="flex gap-2 mt-2 justify-end">
                        <button className="p-2 rounded-lg hover:bg-blue-100 transition">
                          <Edit className="w-4 h-4 text-blue-600" />
                        </button>

                        <button className="p-2 rounded-lg hover:bg-red-100 transition">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* COMMANDES */}
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-600" />
                  Commandes
                </h2>
              </div>

              <div className="divide-y divide-gray-100">
                {recentOrders.map((order) => (
                  <div key={order.id} className="p-6">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold text-gray-800">
                        {order.product}
                      </p>
                      {getStatusBadge(order.status)}
                    </div>

                    <p className="text-sm text-gray-500">
                      {order.customer}
                    </p>

                    <p className="font-semibold text-gray-700 mt-2">
                      {order.amount.toLocaleString()} CFA
                    </p>

                    <div className="flex flex-wrap gap-2 mt-4">
                      <button
                        onClick={() => updateOrderStatus(order.id, 'pending')}
                        className="px-3 py-1 rounded-lg text-xs bg-amber-100 text-amber-700"
                      >
                        En attente
                      </button>

                      <button
                        onClick={() => updateOrderStatus(order.id, 'shipped')}
                        className="px-3 py-1 rounded-lg text-xs bg-blue-100 text-blue-700"
                      >
                        Expédiée
                      </button>

                      <button
                        onClick={() => updateOrderStatus(order.id, 'delivered')}
                        className="px-3 py-1 rounded-lg text-xs bg-emerald-100 text-emerald-700"
                      >
                        Livrée
                      </button>

                      <button
                        onClick={() => updateOrderStatus(order.id, 'cancelled')}
                        className="px-3 py-1 rounded-lg text-xs bg-red-100 text-red-700"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* MESSAGERIE */}
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden mb-8">
            <div className="p-6 border-b border-gray-100">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                Messages clients
              </h2>
            </div>

            <div className="grid md:grid-cols-3 h-[520px]">
              {/* LISTE */}
              <div className="border-r border-gray-100 overflow-y-auto">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedChat(conv.id)}
                    className={`p-4 border-b cursor-pointer transition hover:bg-emerald-50 ${
                      selectedChat === conv.id ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 flex items-center justify-center text-white font-bold">
                        {conv.customerAvatar}
                      </div>

                      <div className="flex-1">
                        <div className="flex justify-between">
                          <p className="font-medium text-gray-800 text-sm">
                            {conv.customerName}
                          </p>
                          <span className="text-xs text-gray-400">
                            {conv.lastMessageTime}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {conv.lastMessage}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CHAT */}
              <div className="md:col-span-2 flex flex-col">
                {currentChat ? (
                  <>
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 flex items-center justify-center text-white font-bold">
                          {currentChat.customerAvatar}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">
                            {currentChat.customerName}
                          </p>
                          <p className="text-xs text-emerald-600 flex items-center gap-1">
                            <Clock3 className="w-3 h-3" />
                            En ligne
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => openWhatsApp(currentChat.customerPhone, 'Bonjour depuis AgriMarché.')}
                        className="px-4 py-2 rounded-xl bg-green-500 text-white text-sm"
                      >
                        WhatsApp
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
                      {currentChat.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.sender === 'seller' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                              msg.sender === 'seller'
                                ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white'
                                : 'bg-white text-gray-700 border'
                            }`}
                          >
                            <p className="text-sm">{msg.text}</p>
                            <p className="text-[10px] mt-1 opacity-70">{msg.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 border-t border-gray-100">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              sendMessage();
                            }
                          }}
                          placeholder="Écrire un message..."
                          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
                        />
                        <button
                          onClick={sendMessage}
                          className="px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400">
                    Sélectionnez une conversation
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MODAL */}
        {showWhatsAppModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                <MessageCircle className="w-10 h-10 text-green-600" />
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-3">
                Finalisation WhatsApp
              </h2>

              <p className="text-gray-500 mb-6">
                Notre équipe peut maintenant finaliser votre inscription.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowWhatsAppModal(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-200"
                >
                  Plus tard
                </button>

                <button
                  onClick={() => openWhatsApp('221779747073', 'Bonjour, je viens de m’inscrire comme vendeur.')}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white"
                >
                  Continuer
                </button>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          @keyframes fade-in {
            from {
              opacity: 0;
              transform: translateY(-15px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fade-in {
            animation: fade-in 0.4s ease-out forwards;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-emerald-50 to-green-50">

      {/* HERO */}
      <div className="bg-gradient-to-r from-emerald-600 to-green-600 text-white py-14">
        <div className="max-w-6xl mx-auto px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Link>

          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-3xl bg-white/20 flex items-center justify-center">
              <Store className="w-10 h-10" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Devenir vendeur</h1>
              <p className="text-emerald-100 mt-2">Rejoignez la marketplace agricole du Sénégal</p>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-6xl mx-auto px-4 py-10 grid lg:grid-cols-5 gap-10">
        {/* FORM */}
        <div className="lg:col-span-3 bg-white rounded-3xl shadow-2xl p-8">
          <div className="mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 flex items-center justify-center mb-4">
              <Crown className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Formulaire vendeur</h2>
            <p className="text-gray-500 mt-1">Remplissez les informations demandées.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <InputField
              icon={<Store className="w-5 h-5 text-gray-400" />}
              name="shopName"
              placeholder="Nom de boutique"
              value={formData.shopName}
              onChange={handleChange}
              error={errors.shopName}
            />

            <InputField
              icon={<Mail className="w-5 h-5 text-gray-400" />}
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
            />

            <InputField
              icon={<Phone className="w-5 h-5 text-gray-400" />}
              name="phone"
              placeholder="+221..."
              value={formData.phone}
              onChange={handleChange}
              error={errors.phone}
            />

            <InputField
              icon={<MapPin className="w-5 h-5 text-gray-400" />}
              name="city"
              placeholder="Ville"
              value={formData.city}
              onChange={handleChange}
              error={errors.city}
            />

            <textarea
              rows={4}
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Décrivez votre activité..."
              className="w-full p-4 rounded-2xl border border-gray-200 outline-none focus:border-emerald-500"
            />

            <button
              type="submit"
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 text-white font-semibold flex items-center justify-center gap-2 hover:shadow-xl transition"
            >
              <Sparkles className="w-5 h-5" />
              Envoyer la demande
            </button>
          </form>
        </div>

        {/* SIDE */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gradient-to-br from-emerald-600 to-green-700 text-white rounded-3xl p-8 shadow-xl">
            <h2 className="text-2xl font-bold mb-3">Pourquoi vendre ici ?</h2>
            <p className="text-emerald-100 mb-6">Développez votre activité rapidement.</p>
            <div className="grid grid-cols-2 gap-4">
              <MiniCard value="50+" label="Vendeurs" />
              <MiniCard value="200+" label="Ventes/mois" />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-xl">
            <h3 className="font-bold text-gray-800 mb-5 flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              Avantages
            </h3>
            <div className="space-y-4">
              <Benefit icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} text="Commission réduite" />
              <Benefit icon={<Users className="w-5 h-5 text-blue-600" />} text="Plus de visibilité" />
              <Benefit icon={<Truck className="w-5 h-5 text-orange-600" />} text="Livraison nationale" />
              <Benefit icon={<Headphones className="w-5 h-5 text-purple-600" />} text="Support prioritaire" />
            </div>
          </div>

          <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-3xl p-6 text-white text-center shadow-xl">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-lg mb-2">Support WhatsApp</h3>
            <p className="text-emerald-100 text-sm mb-5">Assistance rapide et personnalisée.</p>
            <button
              onClick={() => openWhatsApp('221779747073', 'Bonjour AgriMarché.')}
              className="px-6 py-3 rounded-2xl bg-white text-emerald-600 font-semibold"
            >
              Contacter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* COMPONENTS */

function StatCard({ icon, title, value, subtitle }: { icon: React.ReactNode; title: string; value: string | number; subtitle: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-lg border border-emerald-100 hover:shadow-xl transition">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-2xl font-bold text-gray-800">{value}</p>
          <p className="text-xs text-emerald-600 mt-1">{subtitle}</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center">
          {icon}
        </div>
      </div>
    </div>
  );
}

function MiniCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm text-emerald-100">{label}</div>
    </div>
  );
}

function Benefit({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 hover:bg-emerald-50 transition">
      {icon}
      <span className="text-sm text-gray-700">{text}</span>
    </div>
  );
}

function InputField({
  icon,
  name,
  placeholder,
  value,
  onChange,
  error,
}: {
  icon: React.ReactNode;
  name: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}) {
  return (
    <div>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          {icon}
        </div>
        <input
          type="text"
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full pl-12 pr-4 py-4 rounded-2xl border outline-none transition ${
            error ? 'border-red-400' : 'border-gray-200 focus:border-emerald-500'
          }`}
        />
      </div>
      {error && (
        <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}
