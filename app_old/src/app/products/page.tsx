'use client';

// ⚠️ FIX : cette route était une ancienne page produits, non maintenue et
// cassée (le bouton "ajouter au panier" ne faisait littéralement rien :
// onAddToCart={() => {}}). La vraie page produits, à jour et fonctionnelle,
// est /main/products. Aucun lien interne ne pointait ici, mais une URL
// partagée, un marque-page ou un lien indexé côté web pouvait encore y
// mener un utilisateur droit vers une page cassée. On redirige donc vers
// la bonne page plutôt que de supprimer la route (pour ne pas casser un
// lien externe déjà partagé).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProductsPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/main/products');
  }, [router]);

  return null;
}
