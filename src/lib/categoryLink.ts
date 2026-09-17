// src/lib/categoryLink.ts
//
// Source unique des liens « catégorie » et des liens absolus de l'app.
//
// Un lien catégorie ouvre le CATALOGUE RÉEL (/main/products, produits
// Firestore) filtré sur la catégorie, avec éventuellement un produit mis en
// tête (`nouveau`). L'ancienne page /category lisait des produits de
// démonstration (src/data/products.ts) : les vrais produits n'y
// apparaissaient jamais. Elle redirige maintenant ici.
//
// ⚠️ La même logique est dupliquée dans functions/src/index.ts
// (categoryLink) : les garder identiques.

export const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://agrimarche-ultra-v1.vercel.app').replace(/\/$/, '');

export function categorySlug(category?: string | null): string {
  return (category || '').toLowerCase().trim().replace(/\s+/g, '-');
}

export function categoryLink(category?: string | null, productId?: string): string {
  const label = (category || '').trim();
  if (!label) return productId ? `/product?id=${encodeURIComponent(productId)}` : '/main/products';
  const params = new URLSearchParams({ categorie: label });
  if (productId) params.set('nouveau', productId);
  return `/main/products?${params.toString()}`;
}

/**
 * Lien absolu HTTPS. Obligatoire pour webpush.fcmOptions.link : Firebase
 * Admin REFUSE un lien relatif (« /seller/orders ») et fait échouer TOUT
 * l'envoi, y compris vers les téléphones.
 */
export function absoluteAppLink(link?: string | null): string {
  if (!link) return `${APP_BASE_URL}/`;
  if (/^https:\/\//i.test(link)) return link;
  return `${APP_BASE_URL}${link.startsWith('/') ? '' : '/'}${link}`;
}
