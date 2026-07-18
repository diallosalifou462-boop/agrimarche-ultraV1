'use client';

import { useState } from 'react';
import type { ProductFilters } from '@/types';

interface ProductFiltersProps {
  filters: ProductFilters;
  onFilterChange: (filters: ProductFilters) => void;
}

const CATEGORIES = [
  { id: 'cereales', name: '🌾 Céréales', icon: '🌾' },
  { id: 'legumes', name: '🥕 Légumes', icon: '🥕' },
  { id: 'fruits', name: '🍊 Fruits', icon: '🍊' },
  { id: 'tubercules', name: '🥔 Tubercules', icon: '🥔' },
  { id: 'elevage', name: '🐄 Élevage', icon: '🐄' },
  { id: 'poissons', name: '🐟 Poissons', icon: '🐟' },
  { id: 'epices', name: '🌶️ Épices', icon: '🌶️' },
  { id: 'huiles', name: '🫙 Huiles', icon: '🫙' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Plus récents' },
  { value: 'popular', label: 'Populaires' },
  { value: 'rating', label: 'Mieux notés' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
];

export function ProductFilters({ filters, onFilterChange }: ProductFiltersProps) {
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  const update = (partial: Partial<ProductFilters>) =>
    onFilterChange({ ...filters, ...partial });

  const applyPrice = () => {
    update({
      minPrice: priceMin ? Number(priceMin) : undefined,
      maxPrice: priceMax ? Number(priceMax) : undefined,
    });
  };

  const reset = () => {
    setPriceMin('');
    setPriceMax('');
    onFilterChange({});
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Filtres</h2>
        <button onClick={reset} className="text-xs text-green-600 hover:text-green-700">Réinitialiser</button>
      </div>

      {/* Catégories */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Catégorie</h3>
        <div className="space-y-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => update({ category: filters.category === cat.id ? undefined : cat.id })}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                filters.category === cat.id
                  ? 'bg-green-100 text-green-700 font-medium'
                  : 'hover:bg-gray-50 text-gray-600'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tri */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Trier par</h3>
        <select
          value={filters.sortBy || 'newest'}
          onChange={(e) => update({ sortBy: e.target.value as any })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Prix */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Prix (FCFA)</h3>
        <div className="flex gap-2">
          <input
            type="number"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="Min"
            className="w-1/2 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="number"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="Max"
            className="w-1/2 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button
          onClick={applyPrice}
          className="w-full mt-2 bg-green-600 text-white py-1.5 rounded-lg text-sm hover:bg-green-700 transition"
        >
          Appliquer
        </button>
      </div>

      {/* Bio */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => update({ isOrganic: !filters.isOrganic })}
            className={`w-10 h-6 rounded-full transition-colors ${filters.isOrganic ? 'bg-green-500' : 'bg-gray-200'} relative`}
          >
            <div className={`w-4 h-4 bg-white rounded-full shadow absolute top-1 transition-all ${filters.isOrganic ? 'left-5' : 'left-1'}`} />
          </div>
          <span className="text-sm text-gray-700">Produits bio uniquement 🌿</span>
        </label>
      </div>
    </div>
  );
}

