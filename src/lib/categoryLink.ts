// src/lib/categoryLink.ts
//
// Source unique pour générer le lien vers la page catégorie d'un produit
// (/category?category=slug). Utilisé partout où l'on doit rediriger vers
// "tous les produits de cette catégorie" au lieu d'une fiche produit isolée
// (panier, promotions admin, publicités partenaires, push IA...), sur le
// modèle Jumia/Alibaba : cliquer sur un produit/une promo mène à sa
// catégorie complète.
//
// ⚠️ Le slug DOIT rester identique à celui utilisé pour filtrer dans
// src/app/category/page.tsx, sinon la page catégorie affichera "Aucun
// produit trouvé" même si des produits existent.

export function categorySlug(category?: string | null): string {
  return (category || '').toLowerCase().trim().replace(/\s+/g, '-');
}

export function categoryLink(category?: string | null): string {
  const slug = categorySlug(category);
  return slug ? `/category?category=${encodeURIComponent(slug)}` : '/main/products';
}
