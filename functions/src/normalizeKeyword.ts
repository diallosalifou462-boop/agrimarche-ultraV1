// ============================================================
//   normalizeKeyword.ts — extraction de mots-clés pour la
//   personnalisation (syncProductSearchKeywords, notifyRestockMatch,
//   weeklyInterestDigest dans index.ts).
//
//   Ce fichier n'existait pas dans functions/src/ — il est requis par
//   l'import `import { extractKeywords } from './normalizeKeyword'`
//   mais n'avait jamais été écrit. Implémentation simple et robuste
//   plutôt que dépendante d'une librairie externe (pas de nouvelle
//   dépendance npm à ajouter au projet).
// ============================================================

// Mots trop courants en français pour être utiles comme mot-clé de
// recherche produit — les garder ferait matcher un utilisateur avec
// presque tous les produits, ce qui viderait de sens
// notifyRestockMatch et weeklyInterestDigest.
const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'a',
  'au', 'aux', 'en', 'sur', 'pour', 'par', 'avec', 'sans', 'ce', 'ces',
  'cet', 'cette', 'son', 'sa', 'ses', 'leur', 'leurs', 'mon', 'ma',
  'mes', 'ton', 'ta', 'tes', 'notre', 'nos', 'votre', 'vos', 'dans',
]);

// Retire les accents (é → e, ç → c, etc.) pour que "melon" et "melón"
// matchent le même mot-clé, et que la recherche soit tolérante aux
// variantes de saisie sur mobile.
function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extrait un ensemble de mots-clés normalisés (minuscules, sans
 * accents, dédupliqués, stopwords filtrés, longueur >= 2) à partir
 * d'un texte libre — nom de produit, catégorie, etc.
 *
 * Utilisé pour :
 *  - syncProductSearchKeywords : construit products/{id}.searchKeywords
 *  - notifyRestockMatch / weeklyInterestDigest : compare aux mots-clés
 *    d'intérêt d'un utilisateur (users/{id}.interestKeywords)
 *
 * Exemple : extractKeywords("Mangues Kent bio") → ["mangues", "kent", "bio"]
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];

  const normalized = stripAccents(String(text).toLowerCase());
  const words = normalized
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  return [...new Set(words)];
}
