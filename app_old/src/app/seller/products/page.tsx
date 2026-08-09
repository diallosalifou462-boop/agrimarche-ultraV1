'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { 
  Package, Plus, Loader2, Trash2, Eye, EyeOff, 
  Sparkles, TrendingUp, Clock, CheckCircle, XCircle,
  Store, Leaf, Heart, Zap, Shield, Truck, MapPin,
  Sun, Moon, Navigation
} from 'lucide-react';

export default function SellerProductsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [sellerInfo, setSellerInfo] = useState<{ name: string; region: string; city: string } | null>(null);

  // Thème sombre
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

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // ✅ SYNCHRONISATION TEMPS RÉEL avec onSnapshot
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/auth/login');
        return;
      }

      // Vérifier que le profil vendeur est complet
      const { doc: fsDoc, getDoc: fsGet } = await import('firebase/firestore');
      const userSnap = await fsGet(fsDoc(db, 'users', user.uid));
      if (!userSnap.exists()) { router.replace('/seller/register'); return; }
      const ud = userSnap.data();
      if (!ud?.displayName?.trim() || !ud?.phone?.trim() || !ud?.region?.trim()) {
        router.replace('/seller/register');
        return;
      }

      // Charger les infos vendeur
      const userRef = doc(db, 'users', user.uid);
      const unsubUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSellerInfo({
            name: data.displayName || '',
            region: data.region || '',
            city: data.city || '',
          });
        }
      });

      // ✅ Écoute temps réel des produits
      const productsQuery = query(
        collection(db, 'products'),
        where('sellerId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
        const productsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProducts(productsData);
        setLoading(false);
      }, (error) => {
        console.error('Erreur produits:', error);
        showToast('error', 'Impossible de charger les produits');
        setLoading(false);
      });

      return () => {
        unsubUser();
        unsubProducts();
      };
    });

    return () => unsubscribe();
  }, [router]);

  const handleDelete = async (productId: string) => {
    if (!confirm('❌ Supprimer définitivement ce produit ?')) return;
    
    setDeletingId(productId);
    try {
      await deleteDoc(doc(db, 'products', productId));
      showToast('success', 'Produit supprimé avec succès');
    } catch (error) {
      showToast('error', 'Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (product: any) => {
    const newStatus = product.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'products', product.id), { status: newStatus });
      showToast('success', `Produit ${newStatus === 'active' ? 'activé' : 'désactivé'}`);
    } catch (error) {
      showToast('error', 'Erreur lors du changement de statut');
    }
  };

  const stats = {
    total: products.length,
    active: products.filter(p => p.status === 'active').length,
    inactive: products.filter(p => p.status === 'inactive').length,
    totalValue: products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0)
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-gray-900 dark:via-gray-800 dark:to-emerald-950 flex items-center justify-center">
        <div className="relative">
          <div className="w-14 h-14 rounded-full border-4 border-emerald-200 border-t-emerald-600 dark:border-emerald-800 dark:border-t-emerald-400 animate-spin" />
          <Leaf className="absolute inset-0 m-auto w-5 h-5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
          <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-emerald-500 dark:text-emerald-400 whitespace-nowrap">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/40 dark:from-gray-900 dark:via-gray-800 dark:to-emerald-950/30 pb-24 transition-colors duration-300">
      
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slideDown">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg ${
            toast.type === 'success' 
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white' 
              : 'bg-gradient-to-r from-rose-500 to-pink-500 text-white'
          }`}>
            {toast.type === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto px-4 py-6">
        
        {/* Header */}
        <div className="backdrop-blur-xl bg-white/70 dark:bg-gray-800/70 rounded-2xl p-5 mb-6 shadow-lg border border-white/30 dark:border-gray-700 transition-all">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md">
                  <Store size={16} className="text-white" />
                </div>
                <h1 className="text-xl font-black text-gray-800 dark:text-white">Ma boutique</h1>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <Sparkles size={10} />
                {products.length} produit{products.length !== 1 ? 's' : ''} en rayon
                {stats.active > 0 && ` · ${stats.active} actif${stats.active !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm flex items-center justify-center shadow-md hover:scale-105 transition"
              >
                {darkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-gray-600" />}
              </button>
              {/* ✅ CORRECTION : redirection vers la page d'ajout de produit */}
              <button
                onClick={() => router.push('/seller/products/add')}
                className="group relative px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl text-white font-semibold text-sm shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-1">
                  <Plus size={14} />
                  Ajouter
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        {products.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-xl p-3 text-center shadow-sm border border-emerald-100 dark:border-gray-700">
              <Package size={14} className="mx-auto text-emerald-500 dark:text-emerald-400 mb-1" />
              <p className="text-lg font-black text-gray-800 dark:text-white">{stats.total}</p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">Total</p>
            </div>
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-xl p-3 text-center shadow-sm border border-green-100 dark:border-green-900/50">
              <Eye size={14} className="mx-auto text-green-500 dark:text-green-400 mb-1" />
              <p className="text-lg font-black text-green-600 dark:text-green-400">{stats.active}</p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">Actifs</p>
            </div>
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-xl p-3 text-center shadow-sm border border-amber-100 dark:border-amber-900/50">
              <Truck size={14} className="mx-auto text-amber-500 dark:text-amber-400 mb-1" />
              <p className="text-xs font-black text-gray-800 dark:text-white">{Math.round(stats.totalValue / 1000)}k FCFA</p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">Valeur</p>
            </div>
          </div>
        )}

        {/* Message accueil */}
        {products.length === 0 && (
          <div className="bg-gradient-to-br from-white to-emerald-50/50 dark:from-gray-800 dark:to-emerald-900/20 rounded-2xl p-8 text-center shadow-xl border border-emerald-100 dark:border-gray-700 animate-fadeInUp">
            <div className="relative w-24 h-24 mx-auto mb-4">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-teal-400 rounded-2xl rotate-6 opacity-20"></div>
              <div className="relative bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-5 shadow-lg">
                <Leaf size={34} className="text-white mx-auto" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Votre jardin est vide</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Commencez par ajouter votre premier produit<br />
              <span className="text-xs">(Votre localisation sera automatiquement associée)</span>
            </p>
            {/* ✅ CORRECTION : redirection vers la page d'ajout de produit */}
            <button
              onClick={() => router.push('/seller/products/add')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105"
            >
              <Sparkles size={16} />
              Ajouter mon premier produit
            </button>
          </div>
        )}

        {/* Grille produits */}
        {products.length > 0 && (
          <div className="space-y-4 animate-fadeIn">
            {products.map((product, index) => (
              <div 
                key={product.id} 
                className="group bg-white dark:bg-gray-800 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-800"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="flex p-4 gap-4">
                  {/* Image */}
                  <div className="relative w-20 h-20 flex-shrink-0">
                    <div className="relative w-full h-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/50 rounded-xl flex items-center justify-center overflow-hidden">
                      {product.images?.[0] ? (
                        <Image src={product.images[0]} alt={product.name} fill style={{ objectFit: "cover" }} sizes="80px" />
                      ) : (
                        <Package size={28} className="text-emerald-500 dark:text-emerald-400" />
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleStatus(product)}
                      className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-all duration-200 hover:scale-110 ${
                        product.status === 'active' 
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' 
                          : 'bg-gradient-to-r from-gray-400 to-gray-500 text-white'
                      }`}
                    >
                      {product.status === 'active' ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                    {/* Badge localisation */}
                    {(sellerInfo?.region) && (
                      <div className="absolute -bottom-1 -left-1 bg-white/90 dark:bg-gray-800/90 rounded-full px-1.5 py-0.5 shadow-xs">
                        <MapPin size={8} className="text-emerald-500 dark:text-emerald-400 inline mr-0.5" />
                        <span className="text-[8px] font-medium text-gray-600 dark:text-gray-400">
                          {sellerInfo.city || sellerInfo.region}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Infos produit */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-gray-800 dark:text-white truncate text-base">{product.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                            {product.price?.toLocaleString() || 0} <span className="text-xs">FCFA</span>
                          </p>
                          <span className="text-xs text-gray-400 dark:text-gray-500">/{product.unit || 'kg'}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(product.id)}
                        disabled={deletingId === product.id}
                        className="p-2 rounded-xl text-rose-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all duration-200 disabled:opacity-50"
                      >
                        {deletingId === product.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                    
                    {/* Stock badge */}
                    <div className="flex items-center gap-2 mt-2">
                      {product.stock !== undefined && product.stock > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-full text-[9px] font-semibold">
                          <CheckCircle size={9} />
                          {product.stock} en stock
                        </span>
                      ) : product.stock === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-full text-[9px] font-semibold">
                          <Clock size={9} />
                          Rupture
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full text-[9px] font-semibold">
                          <Package size={9} />
                          Stock illimité
                        </span>
                      )}
                      {product.sales > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300 rounded-full text-[9px] font-semibold">
                          <TrendingUp size={9} />
                          {product.sales} vendus
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="h-0.5 bg-gray-100 dark:bg-gray-700 w-full">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-500 rounded-full"
                    style={{ width: product.status === 'active' ? '100%' : '30%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Citation */}
        {products.length > 0 && (
          <div className="mt-8 text-center">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1">
              <Heart size={10} className="text-rose-400" />
              {products.length} produits qui font vivre l'agriculture sénégalaise
              <Shield size={10} className="text-emerald-400 ml-1" />
            </p>
          </div>
        )}

        {/* Rappel localisation */}
        <div className="mt-6 text-center">
          <p className="text-[9px] text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1">
            <Navigation size={9} />
            Les produits affichent automatiquement votre localisation
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
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px) translateX(-50%); }
          to { opacity: 1; transform: translateY(0) translateX(-50%); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.6s cubic-bezier(0.2, 0.9, 0.4, 1.1) forwards;
        }
        .animate-slideDown {
          animation: slideDown 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
