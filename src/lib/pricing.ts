/**
 * Logique de tarification produit — marge plateforme.
 *
 * Chaque produit a deux montants :
 *  - basePrice : le prix que le VENDEUR a demandé à recevoir (ce qu'il saisit
 *    dans son formulaire). Le vendeur ne voit jamais autre chose que ce chiffre
 *    dans son propre formulaire de saisie.
 *  - price     : le prix affiché PARTOUT dans l'application (catalogue, page
 *    produit, panier, commande) — vu par le vendeur ET l'acheteur. C'est
 *    basePrice + la marge plateforme.
 *
 * Seul l'onglet Produits de l'admin a le droit d'afficher les deux montants
 * et la marge qui en découle. Aucune autre partie de l'app ne doit jamais
 * afficher basePrice ni le detail de la marge.
 */

/** Taux de marge plateforme appliqué au prix demandé par le vendeur. */
export const ADMIN_MARGIN_RATE = 0.05; // 5%

/**
 * Calcule le prix affiché (acheteur + vendeur) à partir du prix demandé
 * par le vendeur. Arrondi au FCFA le plus proche (pas de centimes en FCFA).
 */
export function computeDisplayPrice(basePrice: number): number {
  const safeBase = Number(basePrice) || 0;
  return Math.round(safeBase * (1 + ADMIN_MARGIN_RATE));
}

/**
 * Reconstitue un basePrice plausible pour un produit créé AVANT l'introduction
 * de cette automatisation (qui n'a donc que `price`, sans `basePrice` stocké).
 * Utilisé uniquement comme valeur de départ dans le formulaire d'édition admin,
 * pour ne pas casser l'affichage existant tant que l'admin n'a rien modifié.
 */
export function inferBasePrice(displayPrice: number): number {
  const safeDisplay = Number(displayPrice) || 0;
  return Math.round(safeDisplay / (1 + ADMIN_MARGIN_RATE));
}

/** Marge (en FCFA) empochée par la plateforme sur un produit. */
export function computeAdminMargin(basePrice: number): number {
  return computeDisplayPrice(basePrice) - (Number(basePrice) || 0);
}
