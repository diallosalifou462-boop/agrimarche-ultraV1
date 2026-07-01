'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, ShoppingCart, MapPin, Star } from 'lucide-react';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    price: number;
    unit: string;
    category: string;
    region: string;
    image: string;
    rating?: number;
    stock?: number;
  };
  onAddToCart?: () => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const isLowStock = product.stock !== undefined && product.stock <= 5 && product.stock > 0;
  const isOutOfStock = product.stock === 0;

  return (
    <div className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
      
      {/* Image - Sans rotation 3D, zoom léger seulement */}
      <Link href={`/product/${product.id}`} className="block relative">
        <div className="relative aspect-square bg-gradient-to-br from-gray-50 to-emerald-50/30 overflow-hidden">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          )}
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
            className={`object-cover transition-transform duration-500 group-hover:scale-105 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoadingComplete={() => setImageLoaded(true)}
            priority={false}
          />
          
          {/* Badges - Simples et lisibles */}
          <div className="absolute top-2 left-2 flex gap-1">
            {isLowStock && !isOutOfStock && (
              <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                Plus que {product.stock}
              </span>
            )}
            {product.rating && product.rating >= 4.5 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded flex items-center gap-0.5">
                <Star size={10} className="fill-white" />
                Top
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Contenu - Claire et lisible */}
      <div className="p-3">
        <Link href={`/product/${product.id}`}>
          <p className="text-xs text-emerald-600 font-medium mb-1">{product.category}</p>
          <h3 className="font-semibold text-gray-800 text-sm line-clamp-2 min-h-[2.5rem]">
            {product.name}
          </h3>
          <div className="flex items-center gap-1 mt-1">
            <MapPin size={10} className="text-gray-400" />
            <p className="text-xs text-gray-400">{product.region}</p>
          </div>
        </Link>

        {/* Prix - Gros et visible */}
        <div className="flex items-center justify-between mt-2">
          <div>
            <p className="text-lg font-bold text-emerald-700">
              {product.price.toLocaleString()} FCFA
            </p>
            <p className="text-xs text-gray-400">/ {product.unit}</p>
          </div>
          
          {/* Bouton panier - Gros, simple, contrasté */}
          <button
            onClick={onAddToCart}
            disabled={isOutOfStock}
            className={`
              p-2.5 rounded-lg transition-all active:scale-95
              ${isOutOfStock 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }
            `}
          >
            <ShoppingCart size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
