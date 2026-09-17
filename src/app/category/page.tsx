'use client';

// Ancienne page catégorie. Elle affichait des produits de DÉMONSTRATION
// (src/data/products.ts), jamais les vrais produits Firestore : les
// notifications « nouveau produit » y menaient et affichaient « Aucun produit
// trouvé ». Conservée uniquement pour les anciens liens (notifications déjà
// reçues, promos partagées) : elle redirige vers le vrai catalogue filtré.

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { matchCategoryLabel } from '@/lib/notificationLinks';

function CategoryRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const label = matchCategoryLabel(searchParams.get('category'));
    router.replace(label ? `/main/products?${new URLSearchParams({ categorie: label }).toString()}` : '/main/products');
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center text-emerald-700 text-sm">
      Ouverture du catalogue…
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense fallback={null}>
      <CategoryRedirect />
    </Suspense>
  );
}
