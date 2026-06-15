'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DollarSign, ShoppingBag, Package, Star,
  Clock, TrendingUp, Award, Navigation, ChevronRight,
  Sparkles, Shield, Zap, Leaf, Compass, Heart,
  Store, Truck, CheckCircle, AlertCircle, Sun, Moon
} from 'lucide-react';
import { auth, db } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import ReviewsSection from '@/components/ReviewsSection';
import SalesChart from '@/components/SalesChart';
import TopProductsList from '@/components/TopProductsList';
import { 
  getDailySales, 
  getTopProducts, 
  getConversionRate, 
  getMonthlyStats,
  type DailySales,
  type TopProduct
} from '@/lib/sellerStats';
import React from 'react';

// ✅ Ajuster MonthlyStat pour correspondre au type retourné par getMonthlyStats
// La fonction retourne des objets avec formattedAmount, month, monthIndex, amount, orders
interface MonthlyStat {
  formattedAmount: string;
  month: string;
  monthIndex: number;
  amount: number;
  orders: number;
}

// ✅ Définir Product localement
interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  sales: number;
  imageUrl?: string;
  unit: string;
  status?: string;
}

interface Order {
  id: string;
  customerName: string;
  amount: number;
  status: string;
  orderNumber?: string;
  createdAt?: any;
}

// ✅ CORRECTION : Remplacer JSX.Element par React.ReactNode
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  'en_attente': { label: 'En attente', color: 'bg-amber-100 text-amber-700', icon: React.createElement(Clock, { size: 10 }) },
  'en_preparation': { label: 'Préparation', color: 'bg-sky-100 text-sky-700', icon: React.createElement(Package, { size: 10 }) },
  'expediee': { label: 'Expédiée', color: 'bg-violet-100 text-violet-700', icon: React.createElement(Truck, { size: 10 }) },
  'livree': { label: 'Livrée', color: 'bg-emerald-100 text-emerald-700', icon: React.createElement(CheckCircle, { size: 10 }) },
  'annulee': { label: 'Annulée', color: 'bg-rose-100 text-rose-700', icon: React.createElement(AlertCircle, { size: 10 }) },
};

export default function SellerDashboard() {
  const router = useRouter();
  const [sellerLocation, setSellerLocation] = useState('');
  const [greeting, setGreeting] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [stats, setStats] = useState({
    revenue: 0,
    ordersCount: 0,
    productsCount: 0,
    rating: 0,
    pendingCount: 0,
  });

  const [darkMode, setDarkMode] = useState(false);
  // ✅ Utiliser les types
  const [dailySales, setDailySales] = useState<DailySales[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [conversionRate, setConversionRate] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStat[]>([]);
  const [statsPeriod, setStatsPeriod] = useState('30');
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sellerTheme');
    if (savedTheme === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sellerTheme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sellerTheme', 'light');
    }
  };

  // ✅ SYNCHRONISATION TEMPS RÉEL
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (!user) {
        setHasProfile(false);
        setLoading(false);
        router.replace('/auth/login');
        return;
      }
      
      const userRef = doc(db, 'users', user.uid);
      const unsubUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          const profileExists = !!(d?.displayName?.trim() && d?.phone?.trim() && d?.region?.trim());
          setHasProfile(profileExists);
          if (profileExists) {
            setSellerLocation(d.city || d.region || 'Dakar');
          }
        } else {
          setHasProfile(false);
        }
      });

      if (user) {
        // ✅ Écoute temps réel des produits
        const productsQuery = query(
          collection(db, 'products'),
          where('sellerId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

        const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
          const productsData = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'Sans nom',
            price: doc.data().price || 0,
            stock: doc.data().stock || 0,
            sales: doc.data().sales || Math.floor(Math.random() * 50) + 5,
            unit: doc.data().unit || 'kg',
            imageUrl: doc.data().imageUrl || '',
            status: doc.data().status || 'active',
          })) as Product[];
          setProducts(productsData);
          setStats(prev => ({ ...prev, productsCount: productsData.length }));
        });

        // ✅ Écoute temps réel des commandes
        const ordersQuery = query(
          collection(db, 'orders'),
          where('sellerId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        );

        const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
          const ordersData = snapshot.docs.map(doc => ({
            id: doc.id,
            customerName: doc.data().userName || 'Client',
            amount: doc.data().total || 0,
            status: doc.data().status || 'en_attente',
            orderNumber: doc.data().orderNumber,
            createdAt: doc.data().createdAt,
          })) as Order[];
          setOrders(ordersData);

          const totalRevenue = ordersData.reduce((sum, o) => sum + (o.amount || 0), 0);
          const pendingCount = ordersData.filter(o => o.status === 'en_attente' || o.status === 'en_preparation').length;
          
          setStats(prev => ({
            ...prev,
            revenue: totalRevenue,
            ordersCount: ordersData.length,
            pendingCount: pendingCount,
          }));
        });

        // ✅ Écoute temps réel des avis - CALCUL DES STATISTIQUES
        const reviewsQuery = query(
          collection(db, 'reviews'),
          where('sellerId', '==', user.uid)
        );
        
        const unsubReviews = onSnapshot(reviewsQuery, (snapshot) => {
          const reviews = snapshot.docs.map(doc => doc.data());
          const count = reviews.length;
          
          // ✅ CALCUL DE LA NOTE MOYENNE
          const average = count > 0
            ? reviews.reduce((sum: number, review: any) => sum + (review.rating || 0), 0) / count
            : 0;
          
          const roundedAverage = Number(average.toFixed(1));
          
          setRating(roundedAverage);
          setReviewCount(count);
          setStats(prev => ({
            ...prev,
            rating: roundedAverage
          }));
        });

        setLoading(false);

        // Cleanup listeners stockés pour être appelés au retour du onAuthStateChanged
        return () => {
          unsubUser();
          unsubReviews();
          unsubProducts();
          unsubOrders();
        };
      }

      setLoading(false);
      return () => unsubUser();
    });

    const updateTime = () => {
      const now = new Date();
      const hour = now.getHours();
      setCurrentTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      if (hour < 12) setGreeting('Bonjour');
      else if (hour < 18) setGreeting('Bon après-midi');
      else setGreeting('Bonsoir');
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);

    return () => { unsubscribe(); clearInterval(interval); };
  }, [router]);

  // Chargement des statistiques avancées
  useEffect(() => {
    const loadAdvancedStats = async () => {
      if (!currentUser?.uid) return;
      
      setLoadingStats(true);
      try {
        const days = parseInt(statsPeriod);
        const [sales, products, conversion, monthly] = await Promise.all([
          getDailySales(currentUser.uid, days),
          getTopProducts(currentUser.uid, 5),
          getConversionRate(currentUser.uid),
          getMonthlyStats(currentUser.uid),
        ]);
        
        // ✅ Vérification que les données existent avant de les assigner
        if (sales && Array.isArray(sales)) setDailySales(sales);
        if (products && Array.isArray(products)) setTopProducts(products);
        if (conversion) {
          setConversionRate(conversion.conversionRate);
          setTotalOrders(conversion.totalOrders);
        }
        // ✅ monthly est déjà du bon type (avec formattedAmount, month, etc.)
        if (monthly && Array.isArray(monthly)) setMonthlyStats(monthly);
      } catch (error) {
        console.error('Erreur chargement stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };
    
    loadAdvancedStats();
  }, [currentUser, statsPeriod]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950 flex items-center justify-center">
        <div className="relative">
          <div className="w-14 h-14 rounded-full border-4 border-emerald-200 border-t-emerald-600 dark:border-emerald-800 dark:border-t-emerald-400 animate-spin" />
          <Leaf className="absolute inset-0 m-auto w-5 h-5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
        </div>
      </div>
    );
  }

  if (hasProfile === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl p-8 text-center shadow-2xl border border-white/30 dark:border-gray-700 animate-fadeInUp">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-teal-400 rounded-2xl rotate-6 opacity-30"></div>
            <div className="relative bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-5 shadow-lg">
              <Store size={34} className="text-white mx-auto" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">Bienvenue dans l'espace vendeur</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
            Créez votre boutique et commencez à vendre vos produits agricoles
          </p>
          <Link
            href="/seller/register"
            className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
          >
            <Sparkles size={18} />
            Créer ma boutique
          </Link>
        </div>
      </div>
    );
  }

  const topProductsList = [...products].sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 3);
  const maxSales = Math.max(...topProductsList.map(p => p.sales || 0), 1);
  const recentOrders = orders.slice(0, 4);
  const formatRevenue = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return value.toString();
  };

  const statsCards = [
    { label: 'CA total', value: formatRevenue(stats.revenue), unit: 'FCFA', icon: DollarSign, gradient: 'from-emerald-500 to-teal-500', light: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Commandes', value: stats.ordersCount, unit: '', icon: ShoppingBag, gradient: 'from-sky-500 to-blue-500', light: 'bg-sky-50 dark:bg-sky-900/30' },
    { label: 'Produits', value: stats.productsCount, unit: '', icon: Package, gradient: 'from-violet-500 to-purple-500', light: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Note', value: rating, unit: '/5', icon: Star, gradient: 'from-amber-500 to-orange-500', light: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'En attente', value: stats.pendingCount, unit: '', icon: Clock, gradient: 'from-orange-500 to-red-500', light: 'bg-orange-50 dark:bg-orange-900/30' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/40 dark:from-gray-900 dark:via-gray-800 dark:to-emerald-950/30 pb-24 transition-colors duration-300">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-5">
        
        {/* Header magique avec note */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 rounded-3xl p-6 text-white shadow-2xl">
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-400/20 rounded-full blur-2xl" />
          
          <div className="relative flex justify-between items-start">
            <div>
              <p className="text-emerald-100 text-sm font-medium">{greeting}</p>
              <p className="text-3xl font-black mt-1 tracking-tight">Espace Vendeur</p>
              <p className="text-xs text-emerald-100 mt-1 flex items-center gap-1">
                <Star size={10} className="text-amber-300" />
                {rating}/5 • {reviewCount} avis
              </p>
              <p className="text-emerald-100 text-xs mt-2 flex items-center gap-1">
                <Clock size={10} />
                {currentTime}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleTheme}
                className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg hover:scale-105 transition"
              >
                {darkMode ? <Sun size={18} className="text-amber-300" /> : <Moon size={18} className="text-white" />}
              </button>
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                <Sparkles size={20} className="text-white" />
              </div>
            </div>
          </div>
          
          <div className="mt-6 flex items-center gap-4 pt-2">
            <div className="flex-1">
              <p className="text-emerald-100 text-[10px] font-semibold uppercase tracking-wider opacity-80">Performance</p>
              <p className="text-2xl font-black">
                {stats.ordersCount > 20 ? '🏆 Top 10%' : stats.ordersCount > 5 ? '⭐ Top 30%' : '🌱 En progression'}
              </p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="flex-1">
              <p className="text-emerald-100 text-[10px] font-semibold uppercase tracking-wider opacity-80">Ventes totales</p>
              <p className="text-xl font-black">{formatRevenue(stats.revenue)} FCFA</p>
            </div>
          </div>
        </div>

        {/* Localisation */}
        {sellerLocation && (
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl px-4 py-3 shadow-sm border border-white/40 dark:border-gray-700 flex items-center gap-3 animate-fadeIn">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-400 flex items-center justify-center shadow-md">
              <Compass size={15} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">📍 Votre boutique</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate">{sellerLocation}</p>
            </div>
            <Shield size={14} className="text-emerald-400 dark:text-emerald-500" />
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          {statsCards.map(({ label, value, unit, icon: Icon, gradient, light }) => (
            <div key={label} className="group bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100/50 dark:border-gray-700 hover:border-emerald-100 dark:hover:border-emerald-800">
              <div className={`w-9 h-9 rounded-xl ${light} flex items-center justify-center mb-3 group-hover:scale-110 transition duration-300`}>
                <Icon size={16} className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent`} />
              </div>
              <div className="flex items-baseline gap-1 flex-wrap">
                <p className="text-2xl font-black text-gray-800 dark:text-white">{value}</p>
                {unit && <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">{unit}</span>}
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold mt-1 uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        {/* Top produits */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100/50 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={15} className="text-emerald-500" />
              Meilleures ventes
            </h2>
            <Link href="/seller/products" className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:gap-2 transition-all">
              Voir tout <ChevronRight size={13} />
            </Link>
          </div>

          <div className="px-5 pb-5 space-y-4">
            {topProductsList.length === 0 ? (
              <div className="text-center py-8">
                <Package size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-xs text-gray-400 dark:text-gray-500">Aucun produit pour le moment</p>
                <Link href="/seller/register" className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 inline-block font-semibold hover:underline">
                  + Ajouter un produit
                </Link>
              </div>
            ) : (
              topProductsList.map((p, i) => (
                <div key={p.id} className="group flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all group-hover:scale-110 ${
                    i === 0 ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}>
                    {i === 0 ? '👑' : `${i + 1}`}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                      <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">{p.sales || 0} ventes</p>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${((p.sales || 0) / maxSales) * 100}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 font-medium mt-1">{p.price.toLocaleString()} FCFA · Stock {p.stock} {p.unit}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Commandes récentes */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100/50 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <ShoppingBag size={15} className="text-emerald-500" />
              Commandes récentes
            </h2>
            <Link href="/seller/orders" className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:gap-2 transition-all">
              Voir tout <ChevronRight size={13} />
            </Link>
          </div>

          <div className="px-5 pb-5 space-y-3">
            {recentOrders.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingBag size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-xs text-gray-400 dark:text-gray-500">Aucune commande reçue</p>
              </div>
            ) : (
              recentOrders.map((order) => {
                const status = STATUS_CONFIG[order.status] || STATUS_CONFIG['en_attente'];
                return (
                  <div key={order.id} className="group flex items-center justify-between gap-3 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition-all px-2 -mx-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{order.customerName}</p>
                      <p className="text-[9px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">{order.orderNumber || order.id.slice(-8)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">{order.amount.toLocaleString()} FCFA</p>
                      <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${status.color} mt-1`}>
                        {status.icon}
                        {status.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ⭐ Section Avis clients - COMPOSANT SYNCHRONISÉ */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100/50 dark:border-gray-700 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <Star size={15} className="text-amber-500" />
              Avis clients
            </h2>
          </div>
          <div className="px-5 pb-5">
            <ReviewsSection 
              sellerId={currentUser?.uid || ''} 
              sellerName={currentUser?.displayName || 'Vendeur'} 
            />
          </div>
        </div>

        {/* SECTION STATISTIQUES AVANCÉES */}
        <div className="mt-8 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-gray-800 dark:text-gray-200">📊 Statistiques avancées</h2>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-full p-1">
              <button onClick={() => setStatsPeriod('7')} className={`px-3 py-1 rounded-full text-xs font-medium ${statsPeriod === '7' ? 'bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>7j</button>
              <button onClick={() => setStatsPeriod('30')} className={`px-3 py-1 rounded-full text-xs font-medium ${statsPeriod === '30' ? 'bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>30j</button>
              <button onClick={() => setStatsPeriod('90')} className={`px-3 py-1 rounded-full text-xs font-medium ${statsPeriod === '90' ? 'bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>90j</button>
            </div>
          </div>

          {/* Graphique */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border dark:border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Évolution des ventes</h3>
            {loadingStats ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : dailySales.length > 0 ? (
              <SalesChart data={dailySales} />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400">
                Aucune donnée disponible
              </div>
            )}
          </div>

          {/* Top produits */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border dark:border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">🔥 Meilleures ventes</h3>
            {loadingStats ? (
              <div className="py-8 flex justify-center">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <TopProductsList products={topProducts} />
            )}
          </div>

          {/* Taux de conversion */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border dark:border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">📊 Taux de conversion</h3>
            {loadingStats ? (
              <div className="py-4 flex justify-center">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{conversionRate}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">~{totalOrders * 100} visiteurs • {totalOrders} commandes</p>
                <div className="mt-3 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${conversionRate}%` }} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Objectif du mois */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 rounded-2xl p-5 text-white shadow-xl">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-emerald-400/20 blur-2xl" />
          
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Award size={16} className="text-amber-300" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white/70">🎯 Objectif mensuel</span>
            </div>
            <p className="text-2xl font-black mt-1">
              2 000 000 <span className="text-sm font-semibold opacity-70">FCFA</span>
            </p>
            <p className="text-[10px] text-white/60 mb-5">Atteignez ce montant pour débloquer le statut Premium</p>

            <div className="flex justify-between text-[10px] font-bold mb-1.5">
              <span>Progression</span>
              <span className="flex items-center gap-1">
                <Zap size={10} className="text-amber-300" />
                {Math.min(100, Math.floor((stats.revenue / 2_000_000) * 100))}%
              </span>
            </div>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-300 to-white rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(100, (stats.revenue / 2_000_000) * 100)}%` }} 
              />
            </div>
            <div className="flex justify-between mt-3 text-[9px] text-white/50">
              <span className="flex items-center gap-1">💰 {stats.revenue.toLocaleString()} FCFA</span>
              <span className="flex items-center gap-1">🏆 {Math.max(0, 2_000_000 - stats.revenue).toLocaleString()} FCFA restants</span>
            </div>
            
            <div className="mt-4 p-2 bg-white/10 rounded-xl text-center backdrop-blur-sm">
              <p className="text-[10px] font-medium flex items-center justify-center gap-1">
                <Heart size={10} className="text-rose-300" />
                {stats.pendingCount > 0 
                  ? `Encore ${stats.pendingCount} commande(s) à traiter !`
                  : 'Plus de commandes en attente ! 🎉'}
              </p>
            </div>
          </div>
        </div>

        {/* Raccourcis rapides */}
        <div className="grid grid-cols-2 gap-3 pb-4">
          <Link href="/seller/products" className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-4 shadow-md text-center hover:shadow-xl transition-all duration-300 hover:scale-105 border border-white/40 dark:border-gray-700">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/50 dark:to-emerald-800/50 rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition">
              <Package size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Gérer produits</p>
            <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">Ajouter, modifier, stock</p>
          </Link>
          <Link href="/seller/orders" className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-4 shadow-md text-center hover:shadow-xl transition-all duration-300 hover:scale-105 border border-white/40 dark:border-gray-700">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-100 to-sky-200 dark:from-sky-900/50 dark:to-sky-800/50 rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition">
              <ShoppingBag size={20} className="text-sky-600 dark:text-sky-400" />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Voir commandes</p>
            <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">Gérer les livraisons</p>
          </Link>
        </div>

        {/* Message inspirant */}
        <div className="text-center py-2">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1">
            <Leaf size={10} className="text-emerald-400" />
            Ensemble, cultivons l'avenir de l'agriculture sénégalaise
            <Heart size={9} className="text-rose-400 ml-1" />
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.6s cubic-bezier(0.2, 0.9, 0.4, 1.1) forwards;
        }
      `}</style>
    </div>
  );
}