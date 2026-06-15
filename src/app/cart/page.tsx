'use client';

import { useRouter } from 'next/navigation';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(amount);
}

const QUOTES = [
  "La terre donne, le coeur reçoit",
  "Chaque grain est une prière",
  "Cultive ton âme, récolte la paix",
  "La main du paysan est bénie",
  "Mangez ce que la terre vous offre",
  "La gratitude est la plus belle offrande",
  "Semer aujourd'hui, c'est récolter demain",
  "La nature ne se trompe jamais"
];

interface CartItem {
  product: {
    id: string;
    name: string;
    price: number;
    originalPrice?: number;
    unit: string;
    category?: string;
    images?: string[];
    stock?: number;
    farmer?: string;
    sellerName?: string;
    farmerVerified?: boolean;
  };
  quantity: number;
}

interface Cart {
  items: CartItem[];
  total: number;
  itemCount: number;
}

export default function CartPage() {
  const router = useRouter();
  const { cart, removeFromCart, updateQuantity, clearCart } = useCart() as { cart: Cart; removeFromCart: (id: string) => void; updateQuantity: (id: string, quantity: number) => void; clearCart: () => void };
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [quote, setQuote] = useState('');

  useEffect(() => {
    setMounted(true);
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  // ⚠️ PAS de redirection automatique ici
  // La seule redirection se fait au moment du clic sur "Passer la commande"

  const handleCheckout = () => {
    if (!user) {
      router.push('/auth/login?redirect=/cart');
      return;
    }
    router.push('/checkout');
  };

  // ✅ Attendre que la page soit montée pour éviter les erreurs d'hydratation
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-emerald-50/20 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-green-400 rounded-full blur-3xl opacity-20 animate-pulse" />
          <div className="relative w-32 h-32 mx-auto">
            <div className="absolute inset-0 border border-emerald-200 rounded-full animate-spin-slow" />
            <div className="absolute inset-4 border border-emerald-100 rounded-full animate-spin-slow animation-reverse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-green-100 rounded-full" />
            </div>
          </div>
        </div>
        
        <h1 className="text-4xl font-light tracking-wider text-gray-700 mt-8 mb-3">
          Votre panier est vide
        </h1>
        <p className="text-gray-400 text-base mb-2">Aucun produit pour le moment</p>
        <p className="text-xs text-gray-300 mb-8 italic font-light">{quote}</p>
        
        <button
          onClick={() => router.push('/main/products')}
          className="px-12 py-5 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-light text-lg rounded-full transition-all duration-500 hover:shadow-2xl hover:shadow-emerald-500/25 hover:scale-105"
        >
          Découvrir les produits
        </button>

        <div className="absolute bottom-8 left-0 right-0">
          <div className="flex items-center justify-center gap-2">
            <div className="w-12 h-px bg-gradient-to-r from-transparent to-emerald-300" />
            <p className="text-[6px] text-gray-300 tracking-[4px] font-light">AGRIMARCHÉ SÉNÉGAL</p>
            <div className="w-12 h-px bg-gradient-to-l from-transparent to-emerald-300" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-emerald-50/10">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/60 backdrop-blur-xl border-b border-emerald-100">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.back()} 
              className="w-10 h-10 rounded-full bg-white/80 hover:bg-emerald-50 transition-all duration-500 flex items-center justify-center shadow-sm"
            >
              <span className="text-xl">←</span>
            </button>
            
            <div className="flex-1 text-center">
              <h1 className="font-light text-gray-800 text-xl tracking-wider">
                MON PANIER
              </h1>
              <p className="text-[7px] text-emerald-500 tracking-[3px] font-light">PRODUITS SÉLECTIONNÉS</p>
            </div>
            
            <button
              onClick={clearCart}
              className="w-10 h-10 rounded-full bg-white/80 hover:bg-rose-50 transition-all duration-500 flex items-center justify-center shadow-sm"
            >
              <span className="text-lg">⌫</span>
            </button>
          </div>
          
          <div className="mt-3 flex justify-center">
            <div className="bg-gradient-to-r from-emerald-50 via-green-50 to-emerald-50 rounded-full px-6 py-2">
              <span className="text-[9px] font-light text-emerald-700 tracking-wide">
                {cart.itemCount} PRODUIT{cart.itemCount !== 1 ? 'S' : ''}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5 pb-32">
        {/* Liste des produits */}
        {cart.items.map((item, idx) => {
          const images = item.product.images ?? [];
          const productValue = item.product.price * item.quantity;
          const isLast = idx === cart.items.length - 1;
          
          return (
            <div
              key={item.product.id}
              className="group bg-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all duration-500 border border-emerald-100/50 hover:border-emerald-200"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <div className="flex gap-5">
                {/* Image */}
                <div className="relative w-24 h-24 flex-shrink-0">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 to-green-100 rounded-xl blur-sm opacity-0 group-hover:opacity-40 transition-opacity duration-500" />
                  <div className="relative w-full h-full bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl overflow-hidden shadow-md">
                    {images[0] ? (
                      <img
                        src={images[0]}
                        alt={item.product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl">
                        🌾
                      </div>
                    )}
                  </div>
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[6px] text-emerald-500">✦</span>
                    <span className="text-[7px] font-light text-emerald-600 uppercase tracking-[1px]">{item.product.category || 'PRODUIT'}</span>
                  </div>
                  <h3 className="font-medium text-gray-800 text-base truncate">
                    {item.product.name}
                  </h3>
                  <p className="text-[8px] text-gray-400 mt-1">
                    {item.product.farmer || item.product.sellerName || 'Producteur local'}
                    {item.product.farmerVerified && (
                      <span className="ml-2 text-[6px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">Vérifié</span>
                    )}
                  </p>
                  <div className="mt-2">
                    {item.product.originalPrice && item.product.originalPrice > item.product.price && (
                      <p className="text-gray-400 text-xs line-through">{formatPrice(item.product.originalPrice)}</p>
                    )}
                    <p className="text-emerald-600 font-medium text-base">
                      {formatPrice(item.product.price)}
                      <span className="text-[7px] font-light text-gray-400 ml-1">/{item.product.unit}</span>
                    </p>
                  </div>

                  {/* Quantité */}
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-1 bg-gray-50 rounded-full p-1">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-7 h-7 rounded-full bg-white hover:bg-emerald-500 hover:text-white flex items-center justify-center text-sm transition-all duration-300 shadow-sm"
                      >
                        −
                      </button>
                      <span className="text-sm font-medium text-gray-700 w-8 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        disabled={item.quantity >= (item.product.stock || 999)}
                        className="w-7 h-7 rounded-full bg-white hover:bg-emerald-500 hover:text-white flex items-center justify-center text-sm transition-all duration-300 shadow-sm disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    {item.product.stock && item.product.stock > 0 && item.product.stock <= 10 && (
                      <span className="text-[6px] bg-amber-100 text-amber-600 px-2 py-1 rounded-full">Stock limité</span>
                    )}
                  </div>
                </div>

                {/* Valeur */}
                <div className="flex flex-col items-end justify-between flex-shrink-0">
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-gray-300 hover:text-rose-500 transition-all duration-300 text-xl w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center"
                  >
                    ×
                  </button>
                  <div className="mt-2 text-right">
                    <p className="font-medium text-gray-800 text-base">{formatPrice(productValue)}</p>
                  </div>
                </div>
              </div>
              
              {!isLast && (
                <div className="mt-5 h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />
              )}
            </div>
          );
        })}

        {/* Récapitulatif */}
        <div className="relative mt-8">
          <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-emerald-100">
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3">
                <div className="w-8 h-px bg-gradient-to-r from-transparent to-emerald-300" />
                <h2 className="font-light text-gray-700 text-lg tracking-wide">RÉCAPITULATIF</h2>
                <div className="w-8 h-px bg-gradient-to-l from-transparent to-emerald-300" />
              </div>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-500 font-light">Sous-total</span>
                <span className="font-medium text-gray-800">{formatPrice(cart.total)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-500 font-light">Livraison</span>
                <span className="text-emerald-600 font-light">Calculée au paiement</span>
              </div>
              <div className="flex justify-between items-center py-3 mt-2 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl px-4 -mx-1">
                <span className="font-light text-gray-700 text-base">Total</span>
                <span className="text-xl font-light text-emerald-700">
                  {formatPrice(cart.total)}
                </span>
              </div>
            </div>

            <button
              onClick={handleCheckout}
              className="mt-6 w-full bg-gradient-to-r from-emerald-600 to-green-600 text-white font-light py-4 rounded-full transition-all duration-500 hover:shadow-xl hover:shadow-emerald-500/25 hover:scale-[1.02]"
            >
              Passer la commande
            </button>

            <button
              onClick={() => router.push('/main/products')}
              className="mt-3 w-full text-center text-xs text-gray-400 hover:text-emerald-600 py-2 transition-colors duration-300"
            >
              Continuer mes achats
            </button>
          </div>
        </div>

        {/* Citation */}
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-3 px-5 py-2 bg-white/40 backdrop-blur-sm rounded-full">
            <span className="text-emerald-400 text-[8px]">—</span>
            <p className="text-[7px] text-gray-400 tracking-[1px] font-light">
              {quote.toUpperCase()}
            </p>
            <span className="text-emerald-400 text-[8px]">—</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.05); }
        }
        
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
        
        .animation-reverse {
          animation-direction: reverse;
        }
        
        .animate-pulse {
          animation: pulse 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}