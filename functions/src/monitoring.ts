// ============================================================
//   monitoring.ts — Alerting + endpoint pour dashboard admin.
//
//   checkRegistrationHealth (planifiée, toutes les heures) calcule
//   un taux d'échec sur la fenêtre récente et notifie les comptes
//   admin (role === 'admin') si le taux dépasse un seuil — ex :
//   InfoBip en panne, un bug de déploiement qui casse /verify, etc.
//   getRegistrationMetrics (callable, réservé admin) alimente un
//   futur écran de dashboard côté app admin.
// ============================================================
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { getRecentRegistrationMetrics } from './metrics';

const FAILURE_RATE_ALERT_THRESHOLD = 0.3; // 30% d'échec sur la fenêtre → alerte
const MIN_VOLUME_FOR_ALERT = 10; // évite une fausse alerte sur un volume trop faible pour être significatif (ex: 2 échecs sur 3 essais la nuit)
// Anti-spam : sans ça, une panne InfoBip qui dure toute la journée
// déclencherait une notification identique à CHAQUE exécution horaire
// (le taux d'échec est cumulé depuis minuit, donc reste au-dessus du
// seuil pendant des heures) — inutile et fatiguant pour les admins.
const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 1 alerte max toutes les 4h pour un même incident en cours
const FCM_MULTICAST_CHUNK_SIZE = 500; // limite dure de sendEachForMulticast

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Transaction : ne renvoie true (= "on peut alerter") que si aucune alerte
// n'a été envoyée dans la fenêtre de cooldown. Évite une race entre deux
// exécutions qui se chevaucheraient (peu probable avec `every 60 minutes`
// mais sans coût de le rendre atomique).
async function tryAcquireAlertCooldown(): Promise<boolean> {
  const ref = admin.firestore().collection('metrics').doc('_registrationHealthAlertState');
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lastAlertAt = (snap.data()?.lastAlertAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
    if (Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) return false;
    tx.set(ref, { lastAlertAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

async function notifyAdmins(title: string, body: string) {
  const adminsSnap = await admin.firestore().collection('users').where('role', '==', 'admin').get();
  const adminIds = adminsSnap.docs.map((d) => d.id);
  if (adminIds.length === 0) {
    console.warn('⚠️ Aucun compte admin trouvé pour notifier une alerte inscription.');
    return;
  }

  const tokensSnaps = await Promise.all(
    adminIds.map((id) => admin.firestore().collection('users').doc(id).collection('tokens').get())
  );
  const tokens = tokensSnaps.flatMap((s) => s.docs.map((d) => d.id));
  if (tokens.length === 0) return;

  // sendEachForMulticast refuse plus de 500 tokens par appel — avec
  // suffisamment d'admins/appareils, l'appel plantait silencieusement
  // (promesse rejetée, avalée par le .catch ci-dessous) sans jamais
  // notifier personne. On découpe donc en lots.
  await Promise.all(
    chunk(tokens, FCM_MULTICAST_CHUNK_SIZE).map((tokenChunk) =>
      admin.messaging().sendEachForMulticast({
        tokens: tokenChunk,
        notification: { title, body },
        data: { type: 'admin_alert' },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } } },
      }).catch((err) => console.error('❌ Échec notification admin (alerte inscription):', err))
    )
  );

  await Promise.all(
    adminIds.map((id) =>
      admin.firestore().collection('notifications').add({
        userId: id,
        title,
        body,
        type: 'admin_alert',
        icon: '🚨',
        link: '/admin/registration-health',
        priority: 'high',
        urgent: true,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    )
  );
}

export const checkRegistrationHealth = onSchedule(
  { schedule: 'every 60 minutes', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 60 },
  async () => {
    const [today] = await getRecentRegistrationMetrics(1);
    const started = (today?.started ?? 0) as number;
    const verifySuccess = (today?.verify_success ?? 0) as number;
    const verifyFailed = ((today?.verify_invalid_code ?? 0) + (today?.verify_expired ?? 0) + (today?.verify_locked ?? 0)) as number;
    const sendFailed = ((today?.send_failed_push ?? 0) + (today?.send_failed_sms ?? 0)) as number;

    const totalAttempts = verifySuccess + verifyFailed;
    if (totalAttempts < MIN_VOLUME_FOR_ALERT) return;

    const failureRate = verifyFailed / totalAttempts;
    if (failureRate >= FAILURE_RATE_ALERT_THRESHOLD || sendFailed >= MIN_VOLUME_FOR_ALERT) {
      if (!(await tryAcquireAlertCooldown())) return; // incident déjà signalé récemment, ne repage pas les admins
      await notifyAdmins(
        '🚨 Inscription AgriMarché : taux d\'échec anormal',
        `${Math.round(failureRate * 100)}% d'échecs de vérification (${verifyFailed}/${totalAttempts}), ${sendFailed} échec(s) d'envoi, ${started} inscription(s) démarrée(s) aujourd'hui.`
      );
    }
  }
);

export const getRegistrationMetrics = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const callerSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  if (callerSnap.data()?.role !== 'admin') throw new HttpsError('permission-denied', 'ADMIN_ONLY');

  const days = Math.min(Math.max(Number(request.data?.days) || 7, 1), 30);
  return { metrics: await getRecentRegistrationMetrics(days) };
});
