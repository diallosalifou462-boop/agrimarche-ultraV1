// ============================================================
// SYSTÈME CANONIQUE DE STATUTS COMMANDE — SOURCE UNIQUE DE VÉRITÉ
// ============================================================
// Ce fichier est importé par admin-page.tsx, seller-orders-page.tsx
// et delivery-dashboard-page.tsx. Avant ce fichier, chacune des 3 pages
// avait sa propre copie du vocabulaire de statut (couleurs différentes,
// listes de synonymes différentes, un cas où le badge livreur était
// même figé en dur sur "En livraison"). Résultat : le même statut
// Firestore s'affichait avec 3 palettes différentes selon la page.
//
// Toute évolution du pipeline de statut (ajout d'un statut, changement
// de couleur, nouveau synonyme legacy) se fait ICI et se propage
// automatiquement partout.
// ============================================================

export type OrderStatus =
  | 'en_attente'
  | 'en_preparation'
  | 'en_livraison'
  | 'livre'
  | 'annule';

export const ORDER_STATUS_PIPELINE: OrderStatus[] = [
  'en_attente',
  'en_preparation',
  'en_livraison',
  'livre',
];

interface StatusConfig {
  label: string;
  color: string;   // couleur de référence (texte, icônes, accents)
  icon: string;
  /** Prochain statut dans le flux nominal, ou null si terminal */
  next: OrderStatus | null;
}

// Couleurs et libellés canoniques — alignés sur admin-page.tsx (StatusBadge),
// qui était l'implémentation la plus complète avant l'unification.
export const ORDER_STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  en_attente:     { label: 'En attente',     color: '#f59e0b', icon: '⏳', next: 'en_preparation' },
  en_preparation: { label: 'En préparation', color: '#8b5cf6', icon: '🔄', next: 'en_livraison' },
  en_livraison:   { label: 'En livraison',   color: '#06b6d4', icon: '🚚', next: 'livre' },
  livre:          { label: 'Livrée',         color: '#10b981', icon: '✅', next: null },
  annule:         { label: 'Annulée',        color: '#ef4444', icon: '❌', next: null },
};

/**
 * Table de correspondance statut → deliveryStatus, utilisée par
 * <DeliveryUpdateButton /> et pour garder orders.deliveryStatus synchronisé
 * avec orders.status.
 */
export const STATUS_TO_DELIVERY: Record<OrderStatus, string> = {
  en_attente:     'pending',
  en_preparation: 'preparing',
  en_livraison:   'shipped',
  livre:          'delivered',
  annule:         'pending',
};

// Tous les synonymes / anciens formats jamais rencontrés dans Firestore
// (français, anglais, avec/sans accents, anciens statuts pré-migration),
// fusionnés depuis admin-page.tsx et seller-orders-page.tsx.
const LEGACY_STATUS: Record<string, OrderStatus> = {
  en_attente: 'en_attente', pending: 'en_attente', 'en attente': 'en_attente',
  en_preparation: 'en_preparation', preparing: 'en_preparation', 'en préparation': 'en_preparation', 'en cours': 'en_preparation', processing: 'en_preparation',
  en_livraison: 'en_livraison', shipped: 'en_livraison', expediee: 'en_livraison', 'en livraison': 'en_livraison',
  livre: 'livre', livree: 'livre', delivered: 'livre',
  annule: 'annule', annulee: 'annule', cancelled: 'annule',
};

/**
 * Normalise n'importe quelle valeur de statut brute (Firestore, ancien
 * format, faute de frappe d'accents) vers le vocabulaire canonique.
 * Retombe sur 'en_attente' si la valeur est inconnue ou vide.
 */
export function normalizeStatus(raw: string | undefined | null): OrderStatus {
  if (!raw) return 'en_attente';
  const key = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return LEGACY_STATUS[key] ?? LEGACY_STATUS[raw] ?? 'en_attente';
}

export function getStatusConfig(status: string | undefined | null): StatusConfig {
  const normalized = normalizeStatus(status);
  return ORDER_STATUS_CONFIG[normalized];
}

/** Couleur avec transparence, ex. statusTint('en_livraison', 0.12) → 'rgba(6,182,212,0.12)' */
export function statusTint(status: string | undefined | null, alpha: number): string {
  const hex = getStatusConfig(status).color;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Formatage monétaire FCFA cohérent partout dans l'app. */
export function formatFCFA(amount: number | undefined | null): string {
  return `${Math.round(amount ?? 0).toLocaleString('fr-FR')} FCFA`;
}

// ============================================================
// PERMISSIONS CLIENT — DOIVENT REFLÉTER firestore.rules EXACTEMENT
// ============================================================
// Ces deux fonctions encodent le modèle hybride défini dans
// firestore.rules (isSelfCancellableStatus / isInDeliveryStatus).
// Si les règles changent, changez-les ICI et le bouton "Annuler" /
// "Confirmer réception" des 5 pages suit automatiquement — au lieu
// d'avoir un bouton actif dans l'UI que Firestore rejette en silence.

/**
 * Le client ne peut s'auto-annuler que tant que la commande est encore
 * 'en_attente' (avant que le vendeur ne commence la préparation).
 * Au-delà, seul le vendeur ou l'admin peuvent changer le statut —
 * cf. isSelfCancellableStatus() dans firestore.rules.
 */
export function canClientCancel(status: OrderStatus): boolean {
  return status === 'en_attente';
}

/**
 * Le client peut confirmer la réception dès que la commande est
 * en_livraison — cf. isInDeliveryStatus() dans firestore.rules.
 */
export function canClientConfirmDelivery(status: OrderStatus): boolean {
  return status === 'en_livraison';
}
