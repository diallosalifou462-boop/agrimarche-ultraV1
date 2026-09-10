'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

import { db, waitForFirestoreReady } from '@/lib/firebase/firebase';
import { categorySlug } from '@/lib/categoryLink';
import { useCart } from '@/hooks/useCart';

// Même palette que CATEGORIES dans src/app/main/products/page.tsx — chaque
// catégorie garde sa couleur d'un écran à l'autre au lieu d'un vert
// générique unique, pour que la bannière ressemble vraiment au rayon
// qu'elle annonce.
const CATEGORY_STYLES: Record<string, { color: string; soft: string; emoji: string }> = {
  fruits:               { color: '#E8703A', soft: '#FDEEE6', emoji: '🥭' },
  'légumes':            { color: '#3D9A5C', soft: '#E9F6EE', emoji: '🥬' },
  legumes:              { color: '#3D9A5C', soft: '#E9F6EE', emoji: '🥬' },
  'céréales':           { color: '#C9A84C', soft: '#FBF6E9', emoji: '🌾' },
  cereales:             { color: '#C9A84C', soft: '#FBF6E9', emoji: '🌾' },
  tubercules:           { color: '#8B6914', soft: '#F3ECDD', emoji: '🍠' },
  'machines-agricoles': { color: '#607080', soft: '#EBEDF0', emoji: '🚜' },
  condiments:           { color: '#C0392B', soft: '#FAEAE8', emoji: '🌶️' },
  poissons:             { color: '#2980B9', soft: '#E9F3FA', emoji: '🐟' },
  'produits-laitiers':  { color: '#B0A090', soft: '#F3F0EC', emoji: '🥛' },
  'légumineuses':       { color: '#7D6A3E', soft: '#F0ECE2', emoji: '🌱' },
  legumineuses:         { color: '#7D6A3E', soft: '#F0ECE2', emoji: '🌱' },
  engrais:              { color: '#2ECC71', soft: '#E8F9EF', emoji: '🌿' },
  elevage:              { color: '#E74C3C', soft: '#FBEAE8', emoji: '🐄' },
};
const DEFAULT_STYLE = { color: '#059669', soft: '#ECFDF5', emoji: '🛒' };

const QUOTES = [
  "La terre donne, le coeur reçoit",
  "Chaque grain est une prière",
  "Cultive ton âme, récolte la paix",
  "La main du paysan est bénie",
  "Mangez ce que la terre vous offre",
];

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(amount);
}

// Optimise une URL Cloudinary à la volée (même utilitaire que
// main/products/page.tsx) — n'a aucun effet sur les URLs non-Cloudinary.
function cld(url?: string, width = 400): string | undefined {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_fill,w_${width}/`);
}

interface CategoryProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  unit: string;
  images?: string[];
  stock?: number;
  minOrder?: number;
  region?: string;
  farmer?: string;
  sellerName?: string;
  farmerVerified?: boolean;
  status?: string;
}

function ProductTile({
  product,
  accent,
  onQuickAdd,
  justAdded,
}: {
  product: CategoryProduct;
  accent: string;
  onQuickAdd: () => void;
  justAdded: boolean;
}) {
  const img = product.images?.[0];
  const outOfStock = product.stock !== undefined && product.stock !== null && product.stock <= 0;
  const lowStock = !outOfStock && product.stock !== undefined && product.stock !== null && product.stock <= 10;
  const hasDiscount = product.originalPrice && product.originalPrice > product.price;

  return (
    <div className="group relative bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 border border-black/[0.03]">
      <Link href={`/product?id=${product.id}`} className="block">
        <div className="relative aspect-square bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
          {img ? (
            <img
              src={cld(img, 500)}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl opacity-40">🌿</div>
          )}

          {outOfStock && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center">
              <span className="text-[10px] tracking-[2px] uppercase font-medium text-gray-500 bg-white px-3 py-1.5 rounded-full shadow">
                Rupture de stock
              </span>
            </div>
          )}

          {lowStock && (
            <span className="absolute top-2.5 left-2.5 text-[9px] font-medium bg-amber-100/95 text-amber-700 px-2 py-1 rounded-full">
              Stock limité
            </span>
          )}
          {product.farmerVerified && (
            <span className="absolute top-2.5 right-2.5 text-[9px] font-medium bg-emerald-100/95 text-emerald-700 px-2 py-1 rounded-full">
              ✓ Vérifié
            </span>
          )}
        </div>
      </Link>

      <div className="p-4">
        <Link href={`/product?id=${product.id}`}>
          <h3 className="font-medium text-gray-800 text-[15px] leading-snug line-clamp-2 min-h-[2.5em] hover:opacity-70 transition-opacity">
            {product.name}
          </h3>
        </Link>

        <p className="text-[11px] text-gray-400 mt-1 truncate">
          📍 {product.region || 'Sénégal'}
          {(product.farmer || product.sellerName) && ` · ${product.farmer || product.sellerName}`}
        </p>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div>
            {hasDiscount && (
              <p className="text-gray-300 text-[11px] line-through leading-none mb-0.5">
                {formatPrice(product.originalPrice!)}
              </p>
            )}
            <p className="font-medium text-base leading-none" style={{ color: accent }}>
              {formatPrice(product.price)}
              <span className="text-[10px] font-light text-gray-400 ml-1">/{product.unit}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onQuickAdd}
            disabled={outOfStock}
            aria-label={`Ajouter ${product.name} au panier`}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-light shadow-md transition-all duration-300 ${
              outOfStock
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'
                : justAdded
                ? 'bg-emerald-500 text-white scale-110'
                : 'text-white hover:scale-110 hover:shadow-lg active:scale-95'
            }`}
            style={!outOfStock && !justAdded ? { backgroundColor: accent } : undefined}
          >
            {justAdded ? '✓' : '+'}
          </button>
        </div>

        {(product.minOrder || 1) > 1 && (
          <p className="text-[9px] text-gray-400 mt-1.5">Commande min. {product.minOrder} {product.unit}</p>
        )}
      </div>
    </div>
  );
}

function CategoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = (searchParams.get('category') || '').toLowerCase();
  const { cart, addToCart } = useCart() as { cart: { itemCount: number; total: number }; addToCart: (p: any, q?: number) => void };

  const [allProducts, setAllProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  const style = CATEGORY_STYLES[category] || DEFAULT_STYLE;

  // ⚠️ FIX : cette page lisait auparavant le jeu de données de démo statique
  // (@/data/products) au lieu des vrais produits Firestore utilisés partout
  // ailleurs (panier, catalogue, fiche produit). Résultat : cliquer sur un
  // produit réel du panier pouvait afficher un produit fictif totalement
  // différent, simplement parce qu'il partageait la même catégorie dans le
  // jeu de données statique. On charge maintenant les vrais produits, comme
  // useProducts.ts le fait pour /main/products.
  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      try {
        await waitForFirestoreReady();
        const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')));
        if (!cancelled) {
          setAllProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CategoryProduct)));
        }
      } catch (err) {
        console.error('Erreur lors du chargement des produits de la catégorie:', err);
        if (!cancelled) setAllProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const list = allProducts.filter(
      (p) => p.status !== 'inactive' && categorySlug(p.category) === category
    );
    if (sort === 'asc') return [...list].sort((a, b) => a.price - b.price);
    if (sort === 'desc') return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [allProducts, category, sort]);

  const handleQuickAdd = (product: CategoryProduct) => {
    addToCart(product as any, product.minOrder || 1);
    setAddedIds((prev) => new Set(prev).add(product.id));
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }, 1400);
  };

  const displayName = category
    ? category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Produits';

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-emerald-50/10 pb-28">

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/90 hover:bg-gray-50 transition-all duration-300 flex items-center justify-center shadow-sm flex-shrink-0"
            aria-label="Retour"
          >
            <span className="text-xl">←</span>
          </button>

          <Link href="/main/products" className="flex-1 min-w-0 text-center font-light text-gray-800 tracking-wide">
            <span className="text-lg">🌿 AgriMarché</span>
          </Link>

          <Link
            href="/cart"
            className="relative w-10 h-10 rounded-full bg-white/90 hover:bg-gray-50 transition-all duration-300 flex items-center justify-center shadow-sm flex-shrink-0"
            aria-label="Voir le panier"
          >
            <span className="text-lg">🧺</span>
            {cart.itemCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-medium flex items-center justify-center">
                {cart.itemCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* HERO */}
      <div
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${style.soft} 0%, white 65%)` }}
      >
        <div
          className="absolute -top-10 -right-10 w-56 h-56 rounded-full opacity-[0.12] blur-2xl"
          style={{ backgroundColor: style.color }}
        />
        <div className="relative max-w-5xl mx-auto px-4 pt-10 pb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg mb-4"
            style={{ backgroundColor: style.soft, boxShadow: `0 12px 24px -8px ${style.color}55` }}
          >
            {style.emoji}
          </div>
          <h1 className="text-3xl font-light tracking-wide text-gray-800 capitalize">
            {displayName}
          </h1>
          <div className="flex items-center gap-3 mt-3">
            <span
              className="text-[11px] font-medium px-3 py-1.5 rounded-full"
              style={{ backgroundColor: style.soft, color: style.color }}
            >
              {loading ? '···' : filteredProducts.length} produit{filteredProducts.length !== 1 ? 's' : ''}
            </span>

            {!loading && filteredProducts.length > 1 && (
              <div className="flex items-center gap-1.5">
                {([
                  { key: 'default', label: 'Pertinence' },
                  { key: 'asc', label: 'Prix ↑' },
                  { key: 'desc', label: 'Prix ↓' },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSort(opt.key)}
                    className={`text-[11px] font-light px-3 py-1.5 rounded-full transition-all duration-300 ${
                      sort === opt.key
                        ? 'bg-gray-800 text-white'
                        : 'bg-white text-gray-400 hover:text-gray-600 shadow-sm'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-5xl mx-auto px-4 pt-6">

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white rounded-3xl overflow-hidden shadow-sm animate-pulse">
                <div className="aspect-square bg-gray-100" />
                <div className="p-4 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded w-4/5" />
                  <div className="h-3 bg-gray-100 rounded w-2/5" />
                  <div className="h-4 bg-gray-100 rounded w-1/2 mt-2" />
                </div>
              </div>
            ))}
          </div>

        ) : filteredProducts.length === 0 ? (

          <div className="flex flex-col items-center text-center px-6 py-16">
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full blur-3xl opacity-20"
                style={{ backgroundColor: style.color }}
              />
              <div
                className="relative w-24 h-24 rounded-full flex items-center justify-center text-4xl"
                style={{ backgroundColor: style.soft }}
              >
                {style.emoji}
              </div>
            </div>
            <h2 className="text-xl font-light text-gray-700 mt-6 mb-1.5">
              Aucun produit ici pour l'instant
            </h2>
            <p className="text-sm text-gray-400 max-w-xs mb-6">
              Cette catégorie se remplit bientôt — jetez un œil aux autres rayons en attendant.
            </p>
            <button
              onClick={() => router.push('/main/products')}
              className="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-light rounded-full shadow-lg hover:shadow-xl transition-all duration-500 hover:scale-105"
            >
              Voir tous les produits
            </button>
          </div>

        ) : (

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                accent={style.color}
                onQuickAdd={() => handleQuickAdd(product)}
                justAdded={addedIds.has(product.id)}
              />
            ))}
          </div>

        )}

        {/* Citation */}
        <div className="flex justify-center py-10">
          <div className="inline-flex items-center gap-3 px-5 py-2 bg-white/60 backdrop-blur-sm rounded-full">
            <span className="text-emerald-400 text-[8px]">—</span>
            <p className="text-[9px] text-gray-400 tracking-[1px] font-light">{quote.toUpperCase()}</p>
            <span className="text-emerald-400 text-[8px]">—</span>
          </div>
        </div>
      </div>

      {/* Barre panier flottante */}
      {cart.itemCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 px-4 z-40">
          <Link
            href="/cart"
            className="max-w-5xl mx-auto flex items-center justify-between bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-full pl-5 pr-2 py-2 shadow-2xl shadow-emerald-900/20 hover:scale-[1.01] transition-transform duration-300"
          >
            <span className="text-sm font-light">
              🧺 {cart.itemCount} produit{cart.itemCount !== 1 ? 's' : ''} · {formatPrice(cart.total)}
            </span>
            <span className="text-xs font-medium bg-white/20 rounded-full px-4 py-2">
              Voir le panier
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense fallback={null}>
      <CategoryContent />
    </Suspense>
  );
}
