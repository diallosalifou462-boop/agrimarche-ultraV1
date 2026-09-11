// ============================================================
//   rateLimit.ts — Anti-abus pour /registration/start, /resend,
//   /verify (section 4 et 7 du cahier des charges).
//
//   Compteur à fenêtre fixe par clé (numéro, session ou IP). Simple
//   et suffisant ici : pas besoin d'une fenêtre glissante précise
//   pour bloquer du spam, seulement d'un plafond fiable qui ne
//   nécessite pas d'infra supplémentaire (Redis...).
// ============================================================
import * as admin from 'firebase-admin';

export class RateLimitedError extends Error {
  constructor(public retryAfterMs: number) {
    super('RATE_LIMITED');
    this.name = 'RateLimitedError';
  }
}

export async function checkAndConsumeRateLimit(
  key: string,
  opts: { maxAttempts: number; windowMs: number }
): Promise<void> {
  const ref = admin.firestore().collection('rateLimits').doc(key);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.data();

    const windowStart = data?.windowStart ?? 0;
    const withinWindow = now - windowStart < opts.windowMs;
    const count = withinWindow ? (data?.count ?? 0) : 0;

    if (withinWindow && count >= opts.maxAttempts) {
      throw new RateLimitedError(windowStart + opts.windowMs - now);
    }

    tx.set(
      ref,
      {
        windowStart: withinWindow ? windowStart : now,
        count: count + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

// Délai minimum entre deux "Renvoyer le code" (section 7) — distinct
// du compteur ci-dessus qui plafonne le NOMBRE total de demandes.
export async function enforceMinDelay(key: string, minDelayMs: number): Promise<void> {
  const ref = admin.firestore().collection('rateLimits').doc(`${key}:lastAt`);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const lastAt = snap.data()?.at ?? 0;
    if (now - lastAt < minDelayMs) {
      throw new RateLimitedError(minDelayMs - (now - lastAt));
    }
    tx.set(ref, { at: now }, { merge: true });
  });
}

// Purge quotidienne, symétrique à cleanupProcessedEvents dans
// index.ts — évite que rateLimits grossisse indéfiniment.
export async function purgeOldRateLimitDocs(olderThanMs: number): Promise<number> {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
  const snap = await admin
    .firestore()
    .collection('rateLimits')
    .where('updatedAt', '<', cutoff)
    .limit(400)
    .get();
  if (snap.empty) return 0;
  const batch = admin.firestore().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
