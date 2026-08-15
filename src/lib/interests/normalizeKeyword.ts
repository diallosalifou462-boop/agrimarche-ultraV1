// ═══════════════════════════════════════════════════════════════════════
// normalizeKeyword — IDENTIQUE dans functions/src/normalizeKeyword.ts
// ═══════════════════════════════════════════════════════════════════════
// Cette fonction existe en double (client + Cloud Functions, deux runtimes
// séparés qui ne partagent pas de code). Les deux copies DOIVENT rester
// identiques : si un utilisateur tape "Oignons" côté client et qu'on
// normalise différemment côté serveur au moment de matcher un produit
// restocké, le match échoue silencieusement. Toute modification ici doit
// être répercutée dans functions/src/normalizeKeyword.ts.
//
// Stratégie volontairement simple pour un v1 : minuscule, accents retirés,
// 's' final retiré (pluriel naïf, suffisant pour le français courant :
// "oignons"→"oignon", "tomates"→"tomate"), espaces normalisés. Ce n'est
// PAS un vrai stemmer linguistique — "choux"→"choux" (pas "chou") restera
// un angle mort connu. Documenté plutôt que caché.
export function normalizeKeyword(raw: string): string {
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/s$/, ''); // pluriel naïf
}

export function extractKeywords(raw: string): string[] {
  // Une recherche "oignon rouge frais" produit 3 mots-clés distincts
  // ("oignon", "rouge", "frais") plutôt qu'un seul bloc — augmente les
  // chances de match avec le nom exact d'un produit en base, qui est
  // rarement identique mot pour mot à ce que tape l'utilisateur.
  return raw
    .split(/\s+/)
    .map((w) => normalizeKeyword(w))
    .filter((w) => w.length >= 3); // ignore "de", "du", "le"...
}
