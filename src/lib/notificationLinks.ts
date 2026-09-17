// src/lib/notificationLinks.ts
//
// Transforme n'importe quel lien reçu dans une notification (push natif,
// push web, notification in-app) en chemin interne SÛR de l'app.
// Gère les anciens formats encore présents dans l'historique :
//   - /category?category=legumes   → /main/products?categorie=Légumes
//   - /tracking?id=XXX             → /tracking?orderId=XXX
//   - /products                    → /main/products
//   - https://<app>/page           → /page
// Tout lien externe ou invalide est ignoré (pas de redirection hors de l'app).

import { APP_BASE_URL, categorySlug } from '@/lib/categoryLink';

/** Catégories officielles — alignées avec main/products et l'ajout de produit. */
export const PRODUCT_CATEGORIES = [
  'Fruits', 'Légumes', 'Céréales', 'Tubercules', 'Machines agricoles', 'Condiments',
  'Poissons', 'Produits laitiers', 'Légumineuses', 'Engrais', 'Elevage',
];

function stripAccents(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Retrouve le libellé officiel d'une catégorie à partir d'un libellé ou d'un slug. */
export function matchCategoryLabel(raw?: string | null): string | null {
  if (!raw) return null;
  const wanted = stripAccents(categorySlug(decodeURIComponent(raw)));
  return PRODUCT_CATEGORIES.find((c) => stripAccents(categorySlug(c)) === wanted) ?? null;
}

type LinkSource = {
  link?: unknown;
  deepLink?: unknown;
  url?: unknown;
  data?: Record<string, unknown> | null;
} | null | undefined;

function firstString(...values: unknown[]): string | null {
  for (const v of values) if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

export function resolveNotificationLink(source: LinkSource | string): string | null {
  const raw = typeof source === 'string'
    ? source
    : firstString(source?.link, source?.deepLink, source?.url, source?.data?.link, source?.data?.deepLink, source?.data?.url);
  if (!raw) return null;

  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const appHost = new URL(APP_BASE_URL).host;
      const sameApp = u.host === appHost || (typeof window !== 'undefined' && u.host === window.location.host);
      if (!sameApp) return null;
      path = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return null;
    }
  }
  if (!path.startsWith('/') || path.startsWith('//')) return null;

  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);

  if (pathname === '/category') {
    const label = matchCategoryLabel(params.get('category'));
    return label ? `/main/products?${new URLSearchParams({ categorie: label }).toString()}` : '/main/products';
  }
  if (pathname === '/tracking' && !params.get('orderId') && params.get('id')) {
    return `/tracking?orderId=${encodeURIComponent(params.get('id')!)}`;
  }
  if (pathname === '/products') return '/main/products';
  return path;
}

/**
 * Ouvre le lien d'une notification. Si l'app est DÉJÀ sur la même page
 * (ex : catalogue ouvert, notification d'une autre catégorie), on recharge
 * avec la nouvelle adresse : sinon Next.js ne relit pas les paramètres
 * (catégorie, produit) et l'écran ne change pas.
 */
export function openNotificationLink(router: { push: (href: string) => void }, target: string | null): void {
  if (!target) return;
  if (typeof window !== 'undefined') {
    const targetPath = target.split('?')[0];
    if (window.location.pathname.replace(/\/$/, '') === targetPath.replace(/\/$/, '')) {
      window.location.assign(target);
      return;
    }
  }
  router.push(target);
}
