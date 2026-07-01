// components/TopProductsList.tsx

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { TrendingUp, Package } from 'lucide-react';

interface TopProduct {
  id: string;
  name: string;
  price: number;
  sales: number;
  revenue: number;
  imageUrl: string;
}

interface TopProductsListProps {
  products: TopProduct[];
}

export default function TopProductsList({ products }: TopProductsListProps) {
  const maxSales = Math.max(...products.map(p => p.sales), 1);

  if (!products || products.length === 0) {
    return (
      <div className="text-center py-8">
        <Package size={32} className="mx-auto text-gray-300 mb-2" />
        <p className="text-xs text-gray-400">Aucune vente pour le moment</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {products.map((product, index) => {
        const percentage = (product.sales / maxSales) * 100;
        const isTop1 = index === 0;
        const isTop2 = index === 1;
        const isTop3 = index === 2;

        return (
          <Link
            key={product.id}
            href={`/seller/products/${product.id}`}
            className="block group"
          >
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
              {/* Rang */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isTop1 ? 'bg-amber-500 text-white shadow-md' :
                isTop2 ? 'bg-gray-400 text-white' :
                isTop3 ? 'bg-amber-600 text-white' :
                'bg-gray-200 text-gray-500'
              }`}>
                {isTop1 ? '🥇' : isTop2 ? '🥈' : isTop3 ? '🥉' : `${index + 1}`}
              </div>

              {/* Image */}
              <div className="w-10 h-10 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg">
                    🌾
                  </div>
                )}
              </div>

              {/* Infos */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-emerald-600 transition">
                  {product.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-medium text-emerald-600">
                    {product.sales} vendus
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">
                    {product.revenue.toLocaleString()} FCFA
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full transition-all duration-700"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>

              {/* Tendance */}
              <TrendingUp size={14} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
