// ============================================================
//   metrics.ts — Compteurs agrégés du parcours d'inscription,
//   par jour, pour alimenter un dashboard admin et l'alerting.
//
//   Un seul doc par jour (metrics/registration_YYYY-MM-DD) avec des
//   compteurs incrémentés atomiquement — pas de scan de collection
//   coûteux pour afficher un dashboard, tout est déjà agrégé.
// ============================================================
import * as admin from 'firebase-admin';

function todayKey(): string {
  // YYYY-MM-DD en UTC. Coïncide exactement avec Africa/Dakar (UTC+0,
  // pas d'heure d'été) — donc pas de décalage avec les tâches planifiées
  // du fichier index.ts qui, elles, utilisent explicitement ce fuseau.
  return new Date().toISOString().slice(0, 10);
}

export async function bumpRegistrationMetric(field: string, by = 1): Promise<void> {
  try {
    const ref = admin.firestore().collection('metrics').doc(`registration_${todayKey()}`);
    await ref.set(
      {
        [field]: admin.firestore.FieldValue.increment(by),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('⚠️ Échec incrément métrique:', err);
  }
}

// Champs utilisés (créés à la volée par bumpRegistrationMetric, donc
// pas besoin de schéma préalable) :
//   started, started_orange, started_expresso, started_tigo, started_unknown
//   rejected_phone_used, rejected_orange_redirect, rejected_rate_limited
//   sent_push, sent_sms, send_failed_push, send_failed_sms
//   verify_success, verify_invalid_code, verify_expired, verify_locked
//   accounts_created_push_infobip, accounts_created_orange
//   fraud_flagged

export async function getRecentRegistrationMetrics(days: number): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const snap = await admin.firestore().collection('metrics').doc(`registration_${key}`).get();
    out.push({ date: key, ...(snap.data() ?? {}) });
  }
  return out;
}
