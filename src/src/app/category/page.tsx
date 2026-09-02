'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { products } from '@/data/products';

function CategoryContent() {
  const searchParams = useSearchParams();
  const category = searchParams.get('category') || '';

  const filteredProducts =
    products.filter(
      (product) =>
        product.category
          .toLowerCase()
          .replace(/\s+/g, '-') ===
        category.toLowerCase()
    );

  return (
    <div className="min-h-screen bg-gray-50">

      {/* HEADER */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">

          <Link
            href="/main/products"
            className="text-2xl font-bold text-emerald-600"
          >
            🌿 AgriMarché
          </Link>

        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        <h1 className="text-3xl font-bold text-gray-800 mb-8 capitalize">
          Catégorie : {category}
        </h1>

        {filteredProducts.length === 0 ? (

          <div className="bg-white rounded-2xl p-10 text-center shadow">

            <p className="text-gray-500 text-lg">
              Aucun produit trouvé.
            </p>

          </div>

        ) : (

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">

            {filteredProducts.map((product) => (

              <Link
                key={product.id}
                href={`/product?id=${product.id}`}
                className="bg-white rounded-2xl overflow-hidden shadow hover:shadow-xl transition"
              >

                <div className="relative aspect-square bg-gray-100">

                  {product.images?.[0] ? (

                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />

                  ) : (

                    <div className="w-full h-full flex items-center justify-center text-6xl">
                      🌿
                    </div>

                  )}

                </div>

                <div className="p-4">

                  <h2 className="font-bold text-gray-800">
                    {product.name}
                  </h2>

                  <p className="text-emerald-600 font-bold mt-2">
                    {product.price.toLocaleString()} FCFA
                  </p>

                  <p className="text-sm text-gray-400">
                    / {product.unit}
                  </p>

                </div>

              </Link>

            ))}

          </div>

        )}

      </div>

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
