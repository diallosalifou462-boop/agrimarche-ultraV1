'use client';

import { useEffect, useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { ProductCard } from '@/components/ProductCard';

export default function ProductsPage() {
  const { products, loading, error } = useProducts();

  return (
    <div className="min-h-screen bg-gray-100 p-6">

      <h1 className="text-3xl font-bold mb-6">
        AgriMarché
      </h1>

      {loading && (
        <p>Chargement...</p>
      )}

      {error && (
        <p className="text-red-500">
          {error}
        </p>
      )}

      {!loading && (
        <p className="mb-4">
          {products.length} produit(s)
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

        {products.map((product: any) => (
          <ProductCard
            key={product.id}
            product={product}
            onAddToCart={() => {}}
          />
        ))}

      </div>

    </div>
  );
}
