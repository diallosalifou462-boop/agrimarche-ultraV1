'use client';

import Link from 'next/link';
import Image from 'next/image';

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  unit?: string;
  region: string;
  image?: string;
  inStock?: boolean;
}

interface ProductCardProps {
  product: Product;
  onAddToCart: () => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  return (
    <div className="group bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      
      {/* IMAGE + LINK */}
      <Link href={`/product/${product.id}`}>
        <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden cursor-pointer relative">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
              loading="lazy"
            />
          ) : (
            <div className="text-6xl">
              🌾
            </div>
          )}
          
          {/* Badge stock */}
          {product.inStock === false && (
            <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              Rupture
            </div>
          )}
        </div>
      </Link>

      {/* INFO */}
      <div className="p-4">
        {/* Catégorie */}
        <p className="text-xs text-green-600 font-medium mb-1 uppercase tracking-wide">
          {product.category || 'Produit'}
        </p>

        {/* Nom */}
        <Link href={`/product/${product.id}`}>
          <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 hover:text-green-700 transition cursor-pointer">
            {product.name || 'Sans nom'}
          </h3>
        </Link>

        {/* Région */}
        <p className="text-sm text-gray-500 mb-2 flex items-center gap-1">
          <span>📍</span> {product.region || 'Sénégal'}
        </p>

        {/* Prix */}
        <p className="text-green-700 font-bold text-lg mb-3">
          {product.price?.toLocaleString() || 0} FCFA
          {product.unit && (
            <span className="text-xs font-normal text-gray-400 ml-1">
              /{product.unit}
            </span>
          )}
        </p>

        {/* Bouton ajout panier */}
        <button
          onClick={onAddToCart}
          disabled={product.inStock === false}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 ${
            product.inStock === false
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white active:scale-95'
          }`}
        >
          <span>🛒</span>
          {product.inStock === false ? 'Indisponible' : 'Ajouter au panier'}
        </button>
      </div>
    </div>
  );
}