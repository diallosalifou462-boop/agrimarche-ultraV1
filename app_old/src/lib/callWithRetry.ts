/**
 * callWithRetry.ts
 * ============================================================
 * Retry avec backoff exponentiel + jitter, reserve aux erreurs
 * TRANSITOIRES d'un appel Cloud Function callable (coupure reseau
 * breve, instance froide, timeout serveur passager). Ne retente
 * JAMAIS une erreur metier (failed-precondition, permission-denied,
 * invalid-argument, not-found, unauthenticated) -- retenter une
 * transition refusee ne changerait rien et masquerait le vrai
 * probleme a l'utilisateur plus longtemps que necessaire.
 *
 * Partage entre orderActions.ts et reviewActions.ts pour eviter la
 * duplication qu'on a deja du corriger une fois dans ce projet
 * (cf. clientUpdateOrder present dans 4 fichiers).
 */

const RETRYABLE_CODES = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
  'functions/resource-exhausted',
]);

function isRetryable(e: any): boolean {
  const code = e?.code || '';
  if (RETRYABLE_CODES.has(code)) return true;
  // Coupure reseau pure : le SDK ne renvoie parfois aucun code exploitable.
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param fn Fonction a executer (l'appel httpsCallable).
 * @param maxAttempts Nombre total de tentatives (1 = pas de retry).
 */
export async function callWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;

      const isLastAttempt = attempt === maxAttempts;
      if (!isRetryable(e) || isLastAttempt) {
        throw e;
      }

      // Backoff exponentiel (500ms, 1000ms, 2000ms...) + jitter aleatoire
      // pour eviter que tous les clients retentent au meme instant apres
      // un incident cote serveur (effet troupeau / thundering herd).
      const backoffMs = 500 * 2 ** (attempt - 1);
      const jitterMs = Math.random() * 250;
      await sleep(backoffMs + jitterMs);
    }
  }

  throw lastError;
}
